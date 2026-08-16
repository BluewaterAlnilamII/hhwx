import assert from "node:assert/strict";
import test from "node:test";

import {
  BANDORI_PUBLIC_ASSET_SERVERS,
  buildBandoriPublicAssetIndexUrl,
  buildBandoriPublicAssetUrl,
  listBandoriCardAssetVariants,
  lookupBandoriCardImage,
  lookupBandoriEventBanner,
  lookupBandoriEventTeamIcon,
  lookupBandoriMusicChart,
  parseBandoriCardsAssetIndex,
  parseBandoriDegreesAssetIndex,
  parseBandoriEventsAssetIndex,
  parseBandoriMusicAssetIndex,
  parseBandoriStampsAssetIndex,
  resolveBandoriCardAssetVariant,
} from "../src/lib/bandori-public-asset-index.ts";
import {
  getBandoriStampCatalogItemsForRegion,
  parseBandoriStampMasterApiResponse,
} from "../src/lib/bandori-stamp-assets.ts";
import {
  buildCommentStampLookup,
  buildStampShortcode,
} from "../src/lib/comments/comment-content.ts";

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
  stampImage: "a".repeat(64),
  stampVoice: "b".repeat(64),
  stampManifest: "c".repeat(64),
  stampAtlas: "d".repeat(64),
  changedStampImage: "e".repeat(64),
  changedStampAudio: "f".repeat(64),
  changedStampManifest: "0".repeat(64),
  musicJacket: "c".repeat(64),
  musicThumb: "d".repeat(64),
  musicAudio: "e".repeat(64),
  musicChart: "f".repeat(64),
  degreeImage: "1".repeat(64),
  degreeManifest: "2".repeat(64),
  degreeAtlas: "3".repeat(64),
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

function stampsIndex() {
  return {
    schemaVersion: 2,
    updatedAt: "2026-07-25T00:00:00Z",
    stamps: {
      "501": {
        images: [hashes.stampImage, "", "", hashes.stampImage],
        voices: [hashes.stampVoice, "", "", hashes.stampVoice],
        changedStamps: [
          [],
          [],
          [],
          [{
            image: hashes.changedStampImage,
            audio: hashes.changedStampAudio,
          }],
        ],
        animations: {
          cn: {
            manifest: hashes.stampManifest,
            atlas: hashes.stampAtlas,
            frameRate: 12,
            frameCount: 8,
          },
        },
      },
    },
    changedStampGroups: {
      jp: {},
      en: {},
      tw: {},
      cn: {
        "55": hashes.changedStampManifest,
      },
    },
  };
}

function degreesIndex() {
  return {
    schemaVersion: 2,
    updatedAt: "2026-08-11T00:00:00Z",
    resources: {
      degree001: {
        images: [hashes.degreeImage, "", "", hashes.degreeImage],
      },
      ani_degree_cn: {
        animations: {
          cn: {
            manifest: hashes.degreeManifest,
            atlas: hashes.degreeAtlas,
          },
        },
      },
      effect_degree_bili_default01: {
        effects: {
          cn: {
            manifest: hashes.degreeManifest,
            atlas: hashes.degreeAtlas,
          },
        },
      },
    },
  };
}

function musicIndex() {
  return {
    schemaVersion: 2,
    updatedAt: "2026-07-27T00:00:00Z",
    songs: {
      "1": {
        files: {
          jacket: hashes.musicJacket,
          thumb: hashes.musicThumb,
          audio: hashes.musicAudio,
          charts: { "3": hashes.musicChart },
        },
        notes: { "3": 459 },
        bpm: { "3": [{ bpm: 185, start: 0, end: 119.995 }] },
        length: 119.995,
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
  assert.deepEqual(listBandoriCardAssetVariants(parsedNormalOnly, "res001001"), ["normal"]);
  assert.equal(
    resolveBandoriCardAssetVariant(parsedNormalOnly, "res001001", "after_training"),
    "normal",
  );

  const trainedOnly = cardsIndex();
  delete trainedOnly.resources.res001001.images.normal;
  const parsedTrainedOnly = parseBandoriCardsAssetIndex(trainedOnly);
  assert.equal(
    lookupBandoriCardImage(parsedTrainedOnly, "res001001", "normal", "thumb")?.sha256,
    hashes.trainedThumb,
  );
  assert.deepEqual(
    listBandoriCardAssetVariants(parsedTrainedOnly, "res001001"),
    ["after_training"],
  );
  assert.equal(
    resolveBandoriCardAssetVariant(parsedTrainedOnly, "res001001", "normal"),
    "after_training",
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
  assert.deepEqual(
    listBandoriCardAssetVariants(both, "res001001"),
    ["normal", "after_training"],
  );
  assert.equal(resolveBandoriCardAssetVariant(both, "res001001", "normal"), "normal");
  assert.equal(
    resolveBandoriCardAssetVariant(both, "res001001", "after_training"),
    "after_training",
  );
  assert.deepEqual(listBandoriCardAssetVariants(both, "missing"), []);
  assert.equal(resolveBandoriCardAssetVariant(both, "missing", "normal"), null);
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

test("Stamps schema 2 reconstructs content-addressed asset keys from compact hashes", () => {
  const parsed = parseBandoriStampsAssetIndex(stampsIndex());

  assert.deepEqual(parsed.stamps["501"].images[0], {
    key: `bandori/stamps/images/${hashes.stampImage}.png`,
    sha256: hashes.stampImage,
  });
  assert.deepEqual(parsed.stamps["501"].voices[3], {
    key: `bandori/stamps/voices/${hashes.stampVoice}.mp3`,
    sha256: hashes.stampVoice,
  });
  assert.deepEqual(parsed.stamps["501"].animations.cn.manifest, {
    key: `bandori/stamps/animation/manifests/${hashes.stampManifest}.json`,
    sha256: hashes.stampManifest,
  });
  assert.deepEqual(
    Object.keys(parsed.stamps["501"].animations.cn),
    ["manifest", "atlas"],
  );
  assert.deepEqual(parsed.stamps["501"].changedStamps[3][0].image, {
    key: `bandori/stamps/images/${hashes.changedStampImage}.png`,
    sha256: hashes.changedStampImage,
  });
  assert.deepEqual(parsed.changedStampGroups.cn["55"], {
    key: `bandori/stamps/changed/manifests/${hashes.changedStampManifest}.json`,
    sha256: hashes.changedStampManifest,
  });
});

test("Degrees schema 2 reconstructs static, animated, and effect resources", () => {
  const parsed = parseBandoriDegreesAssetIndex(degreesIndex());
  assert.deepEqual(parsed.resources.degree001.images[0], {
    key: `bandori/degrees/images/${hashes.degreeImage}.png`,
    sha256: hashes.degreeImage,
  });
  assert.equal(parsed.resources.degree001.images[1], null);
  assert.deepEqual(parsed.resources.ani_degree_cn.animations.cn, {
    manifest: {
      key: `bandori/degrees/animation/manifests/${hashes.degreeManifest}.json`,
      sha256: hashes.degreeManifest,
    },
    atlas: {
      key: `bandori/degrees/animation/atlases/${hashes.degreeAtlas}.png`,
      sha256: hashes.degreeAtlas,
    },
  });
  assert.deepEqual(parsed.resources.effect_degree_bili_default01.effects.cn, {
    manifest: {
      key: `bandori/degrees/effect/manifests/${hashes.degreeManifest}.json`,
      sha256: hashes.degreeManifest,
    },
    atlas: {
      key: `bandori/degrees/effect/atlases/${hashes.degreeAtlas}.png`,
      sha256: hashes.degreeAtlas,
    },
  });

  const legacy = degreesIndex();
  legacy.schemaVersion = 1;
  delete legacy.resources.effect_degree_bili_default01;
  assert.equal(parseBandoriDegreesAssetIndex(legacy).schemaVersion, 2);

  const conflict = degreesIndex();
  conflict.resources.ani_degree_cn.images = ["", "", "", hashes.degreeImage];
  assert.throws(
    () => parseBandoriDegreesAssetIndex(conflict),
    /must not contain images/u,
  );

  const staticAnimation = degreesIndex();
  staticAnimation.resources.degree001.animations = {
    en: { manifest: hashes.degreeManifest, atlas: hashes.degreeAtlas },
  };
  assert.throws(
    () => parseBandoriDegreesAssetIndex(staticAnimation),
    /must not contain animations/u,
  );

  const empty = degreesIndex();
  empty.resources.empty = { images: ["", "", "", ""] };
  assert.throws(() => parseBandoriDegreesAssetIndex(empty), /images must be omitted when empty/u);

  const mixedEffect = degreesIndex();
  mixedEffect.resources.effect_degree_bili_default01.images = ["", "", "", hashes.degreeImage];
  assert.throws(
    () => parseBandoriDegreesAssetIndex(mixedEffect),
    /effect resource must not mix/u,
  );
});

test("Stamp legacy animation metadata is validated and discarded", () => {
  const invalidRate = stampsIndex();
  invalidRate.stamps["501"].animations.cn.frameRate = 0;
  assert.throws(() => parseBandoriStampsAssetIndex(invalidRate), /invalid frameRate/u);

  const invalidCount = stampsIndex();
  invalidCount.stamps["501"].animations.cn.frameCount = 0;
  assert.throws(() => parseBandoriStampsAssetIndex(invalidCount), /invalid frameCount/u);
});

test("Stamps master and public index join by ID while preserving regional character slots", () => {
  const previousBaseUrl = process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL;
  process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL = "https://assets.example.test";
  try {
    const master = parseBandoriStampMasterApiResponse({
      success: true,
      data: {
        "501": {
          imageName: ["stamp_006035", "stamp_006035", "stamp_001099", "stamp_006035"],
          characterId: [6, 6, 1, 6],
          changedStamps: [
            [],
            [],
            [],
            [{
              imageName: "stamp_006035_changed",
              soundName: "stage_collabo",
            }],
          ],
        },
      },
    });
    const assets = parseBandoriStampsAssetIndex(stampsIndex());
    const cn = getBandoriStampCatalogItemsForRegion({ master, assets }, "cn");

    assert.equal(cn.length, 2);
    assert.equal(cn[0].kind, "normal");
    assert.equal(cn[1].kind, "changed");
    assert.equal(buildStampShortcode(cn[0]), ":stamp-cn-501:");
    assert.equal(buildStampShortcode(cn[1]), ":stamp-cn-501-changed:");
    const lookup = buildCommentStampLookup({ master, assets });
    assert.equal(lookup.get("cn:501:normal")?.kind, "normal");
    assert.equal(lookup.get("cn:501:changed")?.kind, "changed");
    assert.equal(cn[0].characterId, 6);
    assert.equal(
      cn[0].imageUrl,
      `https://assets.example.test/bandori/stamps/images/${hashes.stampImage}.png`,
    );
    assert.equal(
      cn[0].animation.manifestUrl,
      `https://assets.example.test/bandori/stamps/animation/manifests/${hashes.stampManifest}.json`,
    );
    assert.equal(
      cn[1].imageUrl,
      `https://assets.example.test/bandori/stamps/images/${hashes.changedStampImage}.png`,
    );
    assert.equal(
      cn[1].voiceUrl,
      `https://assets.example.test/bandori/stamps/voices/${hashes.changedStampAudio}.mp3`,
    );
    assert.equal(cn[1].animation, undefined);
    assert.deepEqual(
      getBandoriStampCatalogItemsForRegion({ master, assets }, "tw"),
      [],
    );
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL = previousBaseUrl;
    }
  }
});

test("Stamps keep audio-only Changed resources indexed but hidden from the current picker", () => {
  const previousBaseUrl = process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL;
  process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL = "https://assets.example.test";
  try {
    const rawAssets = stampsIndex();
    rawAssets.stamps["501"].changedStamps[3] = [{
      audio: hashes.changedStampAudio,
    }];
    const assets = parseBandoriStampsAssetIndex(rawAssets);
    const master = parseBandoriStampMasterApiResponse({
      success: true,
      data: {
        "501": {
          imageName: ["", "", "", "stamp_bilibili120"],
          characterId: [null, null, null, null],
          changedStamps: [
            [],
            [],
            [],
            [{
              imageName: "stamp_bilibili120",
              soundName: "stage_collabo",
            }],
          ],
        },
      },
    });

    assert.equal(assets.stamps["501"].changedStamps[3][0].audio.sha256, hashes.changedStampAudio);
    const cn = getBandoriStampCatalogItemsForRegion({ master, assets }, "cn");
    assert.equal(cn.length, 1);
    assert.equal(cn[0].kind, "normal");
    assert.equal(cn[0].characterId, null);
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL = previousBaseUrl;
    }
  }
});

test("Music schema 2 reconstructs content-addressed asset keys", () => {
  const parsed = parseBandoriMusicAssetIndex(musicIndex());

  assert.deepEqual(parsed.songs["1"].files.jacket, {
    key: `bandori/music/jackets/${hashes.musicJacket}.png`,
    sha256: hashes.musicJacket,
  });
  assert.deepEqual(parsed.songs["1"].files.audio, {
    key: `bandori/music/audio/${hashes.musicAudio}.mp3`,
    sha256: hashes.musicAudio,
  });
  assert.deepEqual(parsed.songs["1"].files.charts["3"], {
    key: `bandori/music/charts/${hashes.musicChart}.json`,
    sha256: hashes.musicChart,
  });
  assert.equal(
    lookupBandoriMusicChart(parsed, 1, "expert")?.sha256,
    hashes.musicChart,
  );
  assert.equal(lookupBandoriMusicChart(parsed, 1, "special"), null);
  assert.equal(parsed.songs["1"].notes["3"], 459);
});

test("Music parser rejects legacy arrays and incomplete chart metadata", () => {
  const legacy = musicIndex();
  legacy.schemaVersion = "hhwx-bandori-music-index-v1";
  legacy.songs = [{ musicId: 1 }];
  assert.throws(() => parseBandoriMusicAssetIndex(legacy), /Unsupported/u);

  const missingNotes = musicIndex();
  delete missingNotes.songs["1"].notes["3"];
  assert.throws(
    () => parseBandoriMusicAssetIndex(missingNotes),
    /coverage does not match/u,
  );
});

test("Changed Stamp master metadata and assets share a stable positional identity", () => {
  const previousBaseUrl = process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL;
  process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL = "https://assets.example.test";
  try {
    const rawAssets = stampsIndex();
    rawAssets.stamps["501"].changedStamps[3] = [
      { image: hashes.stampImage },
      { image: hashes.changedStampImage, audio: hashes.changedStampAudio },
    ];
    const assets = parseBandoriStampsAssetIndex(rawAssets);
    const master = parseBandoriStampMasterApiResponse({
      success: true,
      data: {
        "501": {
          imageName: ["", "", "", "stamp_bilibili120"],
          characterId: [null, null, null, 6],
          changedStamps: [
            [],
            [],
            [],
            [
              { imageName: "stamp_bilibili120", soundName: "" },
              { imageName: "stamp_bilibili120_changed", soundName: "stage_collabo" },
            ],
          ],
        },
      },
    });

    const cn = getBandoriStampCatalogItemsForRegion({ master, assets }, "cn");
    assert.equal(cn.length, 2);
    assert.equal(cn[1].kind, "changed");
    assert.equal(cn[1].imageName, "stamp_bilibili120_changed");
    assert.equal(cn[1].voiceUrl, `https://assets.example.test/bandori/stamps/voices/${hashes.changedStampAudio}.mp3`);
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL = previousBaseUrl;
    }
  }
});

test("Stamps parsers reject legacy URLs, null slots, and legacy voice names", () => {
  const missingChangedGroups = stampsIndex();
  delete missingChangedGroups.changedStampGroups;
  assert.throws(
    () => parseBandoriStampsAssetIndex(missingChangedGroups),
    /missing changedStampGroups/u,
  );

  const legacy = stampsIndex();
  legacy.stamps["501"].imageUrl = ["https://example.test/image.png", "", "", ""];
  assert.throws(() => parseBandoriStampsAssetIndex(legacy), /unsupported field: imageUrl/u);

  const nullSlot = stampsIndex();
  nullSlot.stamps["501"].images[1] = null;
  assert.throws(() => parseBandoriStampsAssetIndex(nullSlot), /SHA-256/u);

  const legacyVoiceNames = stampsIndex();
  legacyVoiceNames.stamps["501"].voiceNames = ["stamp_006035", "", "", "stamp_006035"];
  assert.throws(
    () => parseBandoriStampsAssetIndex(legacyVoiceNames),
    /unsupported field: voiceNames/u,
  );

  assert.throws(
    () => parseBandoriStampMasterApiResponse({
      success: true,
      data: {
        "1": {
          imageName: ["stamp_001", "", "", ""],
          characterId: [1, null, 0, 0],
        },
      },
    }),
    /record is invalid: 1/u,
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
    buildBandoriPublicAssetIndexUrl("degrees", "https://assets.example.test"),
    "https://assets.example.test/bandori/degrees/index.json",
  );
  assert.equal(
    buildBandoriPublicAssetIndexUrl("music", "https://assets.example.test"),
    "https://assets.example.test/bandori/music/index.json",
  );
  assert.equal(
    buildBandoriPublicAssetIndexUrl("stamps", "https://assets.example.test"),
    "https://assets.example.test/bandori/stamps/index.json",
  );
  assert.equal(
    buildBandoriPublicAssetUrl(descriptor, "https://assets.example.test/"),
    `https://assets.example.test/bandori/cards/res001001/normal/thumb/${hashes.thumb}.png`,
  );
  assert.equal(buildBandoriPublicAssetUrl(descriptor, ""), null);
});
