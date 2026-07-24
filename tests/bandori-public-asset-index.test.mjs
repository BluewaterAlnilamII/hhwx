import assert from "node:assert/strict";
import test from "node:test";

import {
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

function imageSet(entries) {
  return {
    thumb: entries.thumb,
    full: entries.full,
    trim: entries.trim,
  };
}

function cardsIndex() {
  return {
    schemaVersion: 2,
    updatedAt: "2026-07-23T00:00:00Z",
    resources: {
      res001001: {
        images: {
          normal: imageSet(hashes),
          after_training: imageSet({
            thumb: hashes.trainedThumb,
            full: hashes.trainedFull,
            trim: hashes.trainedTrim,
          }),
        },
        gachaVoice: hashes.voice,
      },
    },
  };
}

function eventsIndex() {
  return {
    schemaVersion: 2,
    updatedAt: "2026-07-23T00:00:00Z",
    events: {
      "315": {
        banners: [hashes.banner, null, null, hashes.banner],
        teamIcons: [{
          teamId: 1,
          iconFileName: "team_icon_1.png",
          images: [hashes.teamIcon, null, null, hashes.teamIcon],
        }],
      },
    },
  };
}

test("Cards schema 2 parser reconstructs internal content-addressed descriptors", () => {
  const parsed = parseBandoriCardsAssetIndex(cardsIndex());

  assert.deepEqual(
    lookupBandoriCardImage(parsed, "res001001", "normal", "thumb"),
    {
      key: `bandori/cards/res001001/normal/thumb/${hashes.thumb}.png`,
      sha256: hashes.thumb,
    },
  );
  assert.equal(
    lookupBandoriCardImage(parsed, "res001001", "after_training", "full")?.sha256,
    hashes.trainedFull,
  );
  assert.deepEqual(parsed.resources.res001001.gachaVoice, {
    key: `bandori/cards/res001001/voice/gacha/${hashes.voice}.mp3`,
    sha256: hashes.voice,
  });
  assert.equal(lookupBandoriCardImage(parsed, "missing", "normal", "thumb"), null);
});

test("Cards parser requires schema 2 hashes and complete image sets", () => {
  const legacy = cardsIndex();
  legacy.schemaVersion = 1;
  assert.throws(() => parseBandoriCardsAssetIndex(legacy), /Unsupported/u);

  const missingRole = cardsIndex();
  delete missingRole.resources.res001001.images.normal.thumb;
  assert.throws(() => parseBandoriCardsAssetIndex(missingRole), /missing thumb/u);

  const invalidSha = cardsIndex();
  invalidSha.resources.res001001.images.normal.thumb = "ABC";
  assert.throws(() => parseBandoriCardsAssetIndex(invalidSha), /SHA-256/u);

  const noVariants = cardsIndex();
  noVariants.resources.res001001.images = {};
  assert.throws(
    () => parseBandoriCardsAssetIndex(noVariants),
    /at least one complete image variant/u,
  );

  const legacyDescriptor = cardsIndex();
  legacyDescriptor.resources.res001001.images.normal.thumb = {
    key: "bandori/cards/res001001/normal/thumb/legacy.png",
    sha256: hashes.thumb,
  };
  assert.throws(() => parseBandoriCardsAssetIndex(legacyDescriptor), /SHA-256/u);

  const legacyRootFields = cardsIndex();
  legacyRootFields.gachaVoiceProvenance = "gacha-spin-v2";
  assert.throws(
    () => parseBandoriCardsAssetIndex(legacyRootFields),
    /unsupported field: gachaVoiceProvenance/u,
  );
});

test("Cards image lookup shares one complete variant but keeps two variants exact", () => {
  const normalOnly = cardsIndex();
  delete normalOnly.resources.res001001.images.after_training;
  const parsedNormalOnly = parseBandoriCardsAssetIndex(normalOnly);
  assert.equal(
    lookupBandoriCardImage(parsedNormalOnly, "res001001", "after_training", "thumb")?.sha256,
    hashes.thumb,
  );

  const trainedOnly = cardsIndex();
  delete trainedOnly.resources.res001001.images.normal;
  const parsedTrainedOnly = parseBandoriCardsAssetIndex(trainedOnly);
  assert.equal(
    lookupBandoriCardImage(parsedTrainedOnly, "res001001", "normal", "thumb")?.sha256,
    hashes.trainedThumb,
  );

  const both = parseBandoriCardsAssetIndex(cardsIndex());
  assert.equal(
    lookupBandoriCardImage(both, "res001001", "normal", "thumb")?.sha256,
    hashes.thumb,
  );
  assert.equal(
    lookupBandoriCardImage(both, "res001001", "after_training", "thumb")?.sha256,
    hashes.trainedThumb,
  );
});

test("Events schema 2 uses the implicit fixed jp/en/tw/cn four-slot contract", () => {
  const parsed = parseBandoriEventsAssetIndex(eventsIndex());

  assert.deepEqual(BANDORI_PUBLIC_ASSET_SERVERS, ["jp", "en", "tw", "cn"]);
  assert.equal(lookupBandoriEventBanner(parsed, 315, "jp")?.sha256, hashes.banner);
  assert.equal(lookupBandoriEventBanner(parsed, 315, "en"), null);
  assert.equal(
    lookupBandoriEventTeamIcon(parsed, 315, 1, "cn")?.sha256,
    hashes.teamIcon,
  );

  const legacyServers = eventsIndex();
  legacyServers.servers = ["jp", "en", "tw", "cn"];
  assert.throws(
    () => parseBandoriEventsAssetIndex(legacyServers),
    /unsupported field: servers/u,
  );

  const legacySchema = eventsIndex();
  legacySchema.schemaVersion = 1;
  assert.throws(() => parseBandoriEventsAssetIndex(legacySchema), /Unsupported/u);

  const legacyDescriptor = eventsIndex();
  legacyDescriptor.events["315"].banners[0] = {
    key: `bandori/events/images/${hashes.banner}.png`,
    sha256: hashes.banner,
  };
  assert.throws(() => parseBandoriEventsAssetIndex(legacyDescriptor), /SHA-256/u);

  const shortSlots = eventsIndex();
  shortSlots.events["315"].banners.pop();
  assert.throws(
    () => parseBandoriEventsAssetIndex(shortSlots),
    /exactly four regional slots/u,
  );
});

test("public asset URLs append reconstructed descriptor keys to the browser CDN base", () => {
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
