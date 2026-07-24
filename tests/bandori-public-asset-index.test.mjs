import assert from "node:assert/strict";
import test from "node:test";

import {
  BANDORI_CARD_GACHA_VOICE_PROVENANCE,
  BANDORI_PUBLIC_ASSET_SERVERS,
  buildBandoriPublicAssetIndexUrl,
  buildBandoriPublicAssetUrl,
  lookupBandoriCardImage,
  lookupBandoriEventBanner,
  lookupBandoriEventTeamIcon,
  parseBandoriCardsAssetIndex,
  parseBandoriEventsAssetIndex,
} from "../src/lib/bandori-public-asset-index.ts";

const hashes = {
  thumb: "1".repeat(64),
  full: "2".repeat(64),
  trim: "3".repeat(64),
  trainedThumb: "4".repeat(64),
  trainedFull: "5".repeat(64),
  trainedTrim: "6".repeat(64),
  voice: "7".repeat(64),
  banner: "8".repeat(64),
  teamIcon: "9".repeat(64),
};

function pngDescriptor(prefix, sha256) {
  return {
    key: `${prefix}/${sha256}.png`,
    sha256,
    byteSize: 1234,
    contentType: "image/png",
    width: 256,
    height: 256,
  };
}

function cardsIndex() {
  const resourceSetName = "res001001";
  const imageSet = (variant, entries) => ({
    thumb: pngDescriptor(
      `bandori/cards/${resourceSetName}/${variant}/thumb`,
      entries.thumb,
    ),
    full: pngDescriptor(
      `bandori/cards/${resourceSetName}/${variant}/full`,
      entries.full,
    ),
    trim: pngDescriptor(
      `bandori/cards/${resourceSetName}/${variant}/trim`,
      entries.trim,
    ),
  });
  return {
    schemaVersion: 1,
    updatedAt: "2026-07-23T00:00:00Z",
    gachaVoiceProvenance: "gacha-spin-v2",
    resources: {
      [resourceSetName]: {
        artPlan: {
          normalSourceVariant: "normal",
          hasAfterTraining: true,
        },
        images: {
          normal: imageSet("normal", hashes),
          after_training: imageSet("after_training", {
            thumb: hashes.trainedThumb,
            full: hashes.trainedFull,
            trim: hashes.trainedTrim,
          }),
        },
        gachaVoice: {
          key: `bandori/cards/${resourceSetName}/voice/gacha/${hashes.voice}.mp3`,
          sha256: hashes.voice,
          byteSize: 4321,
          contentType: "audio/mpeg",
          durationMs: 1800,
        },
      },
    },
  };
}

function eventsIndex() {
  return {
    schemaVersion: 1,
    updatedAt: "2026-07-23T00:00:00Z",
    servers: ["jp", "en", "tw", "cn"],
    events: {
      "315": {
        banners: [
          pngDescriptor("bandori/events/images", hashes.banner),
          null,
          null,
          pngDescriptor("bandori/events/images", hashes.banner),
        ],
        teamIcons: [{
          teamId: 1,
          iconFileName: "team_icon_1.png",
          images: [
            pngDescriptor("bandori/events/images", hashes.teamIcon),
            null,
            null,
            pngDescriptor("bandori/events/images", hashes.teamIcon),
          ],
        }],
      },
    },
  };
}

test("Cards index parser preserves strict image and audio descriptors", () => {
  const parsed = parseBandoriCardsAssetIndex(cardsIndex());

  assert.equal(
    lookupBandoriCardImage(parsed, "res001001", "normal", "thumb")?.sha256,
    hashes.thumb,
  );
  assert.equal(
    lookupBandoriCardImage(parsed, "res001001", "after_training", "full")?.sha256,
    hashes.trainedFull,
  );
  assert.equal(parsed.resources.res001001.gachaVoice?.durationMs, 1800);
  assert.equal(
    parsed.gachaVoiceProvenance,
    BANDORI_CARD_GACHA_VOICE_PROVENANCE,
  );
  assert.deepEqual(parsed.resources.res001001.artPlan, {
    normalSourceVariant: "normal",
    hasAfterTraining: true,
  });
  assert.equal(
    lookupBandoriCardImage(parsed, "missing", "normal", "thumb"),
    null,
  );
});

test("Cards index requires complete image sets and content-addressed descriptors", () => {
  const missingRole = cardsIndex();
  delete missingRole.resources.res001001.images.normal.thumb;
  assert.throws(
    () => parseBandoriCardsAssetIndex(missingRole),
    /missing thumb/u,
  );

  const invalidKey = cardsIndex();
  invalidKey.resources.res001001.images.normal.thumb.key =
    `bandori/cards/res001001/normal/thumb/${hashes.full}.png`;
  assert.throws(
    () => parseBandoriCardsAssetIndex(invalidKey),
    /content-addressed key/u,
  );

  const invalidSha = cardsIndex();
  invalidSha.resources.res001001.images.normal.thumb.sha256 = "ABC";
  assert.throws(() => parseBandoriCardsAssetIndex(invalidSha), /SHA-256/u);

  const invalidSize = cardsIndex();
  invalidSize.resources.res001001.images.normal.thumb.byteSize = 0;
  assert.throws(() => parseBandoriCardsAssetIndex(invalidSize), /byteSize/u);

  const invalidContentType = cardsIndex();
  invalidContentType.resources.res001001.images.normal.thumb.contentType = "image/webp";
  assert.throws(() => parseBandoriCardsAssetIndex(invalidContentType), /content type/u);

  const mismatchedArtPlan = cardsIndex();
  mismatchedArtPlan.resources.res001001.artPlan.hasAfterTraining = false;
  assert.throws(
    () => parseBandoriCardsAssetIndex(mismatchedArtPlan),
    /artPlan does not match/u,
  );

  const legacyVoiceProvenance = cardsIndex();
  legacyVoiceProvenance.gachaVoiceProvenance = "voice-pack-v0";
  assert.throws(
    () => parseBandoriCardsAssetIndex(legacyVoiceProvenance),
    /gacha voice provenance/u,
  );
});

test("Events index enforces the fixed jp/en/tw/cn four-slot contract", () => {
  const parsed = parseBandoriEventsAssetIndex(eventsIndex());

  assert.deepEqual(parsed.servers, BANDORI_PUBLIC_ASSET_SERVERS);
  assert.equal(lookupBandoriEventBanner(parsed, 315, "jp")?.sha256, hashes.banner);
  assert.equal(lookupBandoriEventBanner(parsed, 315, "en"), null);
  assert.equal(
    lookupBandoriEventTeamIcon(parsed, 315, 1, "cn")?.sha256,
    hashes.teamIcon,
  );

  const wrongOrder = eventsIndex();
  wrongOrder.servers = ["jp", "en", "cn", "tw"];
  assert.throws(
    () => parseBandoriEventsAssetIndex(wrongOrder),
    /regional slot order/u,
  );

  const shortSlots = eventsIndex();
  shortSlots.events["315"].banners.pop();
  assert.throws(
    () => parseBandoriEventsAssetIndex(shortSlots),
    /exactly four regional slots/u,
  );
});

test("public asset URLs append validated relative descriptor keys to the browser CDN base", () => {
  const parsed = parseBandoriCardsAssetIndex(cardsIndex());
  const descriptor = lookupBandoriCardImage(parsed, "res001001", "normal", "thumb");

  assert.equal(
    buildBandoriPublicAssetIndexUrl("cards", "https://assets.example.test/"),
    "https://assets.example.test/bandori/cards/index.json",
  );
  assert.equal(
    buildBandoriPublicAssetIndexUrl("events", "https://assets.example.test"),
    "https://assets.example.test/bandori/events/index.json",
  );
  assert.equal(
    buildBandoriPublicAssetUrl(descriptor, "https://assets.example.test/"),
    `https://assets.example.test/bandori/cards/res001001/normal/thumb/${hashes.thumb}.png`,
  );
  assert.equal(buildBandoriPublicAssetUrl(descriptor, ""), null);
});
