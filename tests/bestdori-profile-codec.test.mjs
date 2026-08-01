import assert from "node:assert/strict";
import test from "node:test";

import { resolveBandoriCardMapForServerWithJpFallback } from "../src/lib/bandori-card-server-extensions.ts";
import {
  BESTDORI_PROFILE_COMPRESSION_VERSION,
  decodeBestdoriCardIds,
  decodeBestdoriProfile,
  decodeBestdoriUint16Ids,
  encodeBestdoriCardIds,
  encodeBestdoriProfile,
  encodeBestdoriUint16Ids,
} from "../src/lib/bestdori-profile-codec.ts";
import {
  compactMissionBonusRecords,
  compactPotentialRecords,
  decodeCompressedGameProfilePayload,
  encodeCompressedGameProfilePayload,
  exportBestdoriGameProfilePayload,
  getGameProfileCharacterMissionBonuses,
  getGameProfileCharacterPotentials,
  importBestdoriGameProfilePayload,
} from "../src/lib/user-game-profile-payload.ts";
import {
  decodeGameProfilePayload,
  encodeGameProfilePayload,
} from "../src/lib/user-game-profile-payload-server.ts";

const EN_SERVER = 1;
const JP_SERVER = 0;

function createCard(cardId, overrides = {}) {
  return {
    cardId,
    level: 60,
    masterRank: 4,
    skillLevel: 5,
    episodeCount: 2,
    isTrained: true,
    hasTrainedArt: true,
    isExcluded: false,
    ...overrides,
  };
}

function createNormalizedProfile(server = EN_SERVER) {
  return {
    name: "Codec Test",
    server,
    cards: [
      createCard(10054),
      createCard(90041, { level: 50, masterRank: 0 }),
      createCard(90050, { level: 40, skillLevel: 4 }),
    ],
    items: {
      Everyone: [1, null, 3],
    },
    potentials: [],
  };
}

function cardIds(profile) {
  return decodeBestdoriProfile(profile).cards.map((card) => card.cardId).sort((left, right) => left - right);
}

test("Bestdori uint16 helpers preserve raw non-card IDs", () => {
  const values = [1, 50, 24464, 24505, 65535];

  assert.deepEqual(decodeBestdoriUint16Ids(encodeBestdoriUint16Ids(values)), values);
});

test("Bestdori compression v2 restores wrapped 90000-series card IDs", () => {
  const expectedCardIds = [1, 10054, 24464, 90001, 90041, 90050];
  const encoded = encodeBestdoriCardIds(expectedCardIds);

  assert.deepEqual(decodeBestdoriCardIds(encoded), expectedCardIds);
  assert.equal(
    encodeBestdoriCardIds([90041]),
    encodeBestdoriUint16Ids([24505]),
  );
  assert.deepEqual(
    decodeBestdoriCardIds(encodeBestdoriUint16Ids([
      24505,
      24506,
      24507,
      24508,
      24509,
      24510,
      24511,
      24512,
      24513,
      24514,
    ])),
    [90041, 90042, 90043, 90044, 90045, 90046, 90047, 90048, 90049, 90050],
  );
});

test("Bestdori profile round-trips high card IDs and all gameplay servers", () => {
  for (const server of [0, 1, 2, 3]) {
    const encoded = encodeBestdoriProfile(createNormalizedProfile(server));

    assert.equal(encoded.compression, BESTDORI_PROFILE_COMPRESSION_VERSION);
    assert.equal(encoded.server, server);
    assert.equal(decodeBestdoriProfile(encoded).server, server);
    assert.deepEqual(cardIds(encoded), [10054, 90041, 90050]);
  }
});

test("Bestdori profiles reject invalid gameplay server IDs", () => {
  const encoded = encodeBestdoriProfile(createNormalizedProfile(EN_SERVER));

  assert.throws(
    () => decodeBestdoriProfile({ ...encoded, server: -1 }),
    /Bestdori profile server 无效/u,
  );
  assert.throws(
    () => importBestdoriGameProfilePayload({ ...encoded, server: 4 }),
    /Bestdori profile server 无效/u,
  );
});

test("profile payload storage codecs preserve high card IDs", async () => {
  const imported = importBestdoriGameProfilePayload(
    encodeBestdoriProfile(createNormalizedProfile(EN_SERVER)),
  );

  const serverRoundTrip = decodeGameProfilePayload(encodeGameProfilePayload(imported));
  assert.deepEqual(cardIds(serverRoundTrip.bestdoriProfile), [10054, 90041, 90050]);

  const browserRoundTrip = await decodeCompressedGameProfilePayload(
    await encodeCompressedGameProfilePayload(imported),
  );
  assert.deepEqual(cardIds(browserRoundTrip.bestdoriProfile), [10054, 90041, 90050]);

  const exported = exportBestdoriGameProfilePayload(serverRoundTrip);
  assert.equal(exported.compression, BESTDORI_PROFILE_COMPRESSION_VERSION);
  assert.deepEqual(cardIds(exported), [10054, 90041, 90050]);
});

test("character potential and mission compact IDs remain raw uint16 values", () => {
  const characterPotentials = [
    { characterId: 1, performanceLevel: 10, techniqueLevel: 20, visualLevel: 30 },
    { characterId: 50, performanceLevel: null, techniqueLevel: 40, visualLevel: 50 },
  ];
  const characterMissionBonuses = [
    { characterId: 1, bonusType: "TRAINING", performance: 1, technique: 2, visual: 3 },
    { characterId: 50, bonusType: "COLLECTION", performance: 4, technique: 5, visual: 6 },
  ];
  const compactPotentials = compactPotentialRecords(characterPotentials);
  const compactMissionBonuses = compactMissionBonusRecords(characterMissionBonuses);
  const payload = {
    bestdoriProfile: encodeBestdoriProfile(createNormalizedProfile(EN_SERVER)),
    characterPotentials: compactPotentials,
    characterMissionBonuses: compactMissionBonuses,
  };

  assert.deepEqual(decodeBestdoriUint16Ids(compactPotentials.ids), [1, 50]);
  assert.deepEqual(decodeBestdoriUint16Ids(compactMissionBonuses.ids), [1, 50]);
  assert.deepEqual(getGameProfileCharacterPotentials(payload), characterPotentials);
  assert.deepEqual(
    getGameProfileCharacterMissionBonuses(payload),
    [
      { characterId: 1, bonusType: "TRAINING", performance: 1, technique: 2, visual: 3 },
      { characterId: 1, bonusType: "COLLECTION", performance: 0, technique: 0, visual: 0 },
      { characterId: 50, bonusType: "TRAINING", performance: 0, technique: 0, visual: 0 },
      { characterId: 50, bonusType: "COLLECTION", performance: 4, technique: 5, visual: 6 },
    ],
  );
});

test("restored EN-only card IDs still obey profile server isolation", () => {
  const [restoredCardId] = decodeBestdoriCardIds(encodeBestdoriUint16Ids([24505]));
  const canonicalCards = {
    [restoredCardId]: {
      serverExtensions: [null, {}, null, null],
    },
  };

  const jpCards = resolveBandoriCardMapForServerWithJpFallback(canonicalCards, JP_SERVER);
  const enCards = resolveBandoriCardMapForServerWithJpFallback(canonicalCards, EN_SERVER);

  assert.equal(restoredCardId, 90041);
  assert.equal(Object.hasOwn(jpCards, "90041"), false);
  assert.equal(Object.hasOwn(enCards, "90041"), true);
});
