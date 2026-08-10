import assert from "node:assert/strict";
import test from "node:test";
import {
  BANDORI_CARD_CATALOG_TYPES,
  buildBandoriCardsPageCatalog,
  filterBandoriCardsPageCatalog,
} from "../src/lib/bandori/cards/cards-page-catalog.ts";
import {
  BANDORI_CARD_ATTRIBUTES,
  BANDORI_CARD_RARITIES,
} from "../src/lib/bandori/cards/filter.ts";
import {
  BANDORI_SERVERS,
  pickAvailableBandoriServer,
} from "../src/lib/bandori-server.ts";

const availableBandIds = [1];
const availableCharacterIds = [21, 22];

function createEntry(overrides = {}) {
  return {
    cardId: 1,
    cardRef: "1",
    entityServer: null,
    availableServers: [...BANDORI_SERVERS],
    displayServer: 0,
    displayCard: {},
    displayName: "Card",
    characterName: "Character",
    skillEffectLabel: "Skill",
    bandId: 1,
    characterId: 21,
    rarity: 2,
    attribute: "cool",
    type: "permanent",
    resourceSetName: "res001001",
    levelLimit: 30,
    trainingLevelLimit: 0,
    hasTrainedArt: false,
    releaseTimestamps: [100, 100, 100, 100],
    displayReleaseTimestamp: 100,
    filterBandId: 1,
    filterCharacterId: 21,
    filterRarity: 2,
    filterAttribute: "cool",
    filterType: "permanent",
    filterSearchText: "card character skill",
    ...overrides,
  };
}

function createFilter(overrides = {}) {
  return {
    query: "",
    servers: [...BANDORI_SERVERS],
    bandIds: [...availableBandIds],
    attributes: [...BANDORI_CARD_ATTRIBUTES],
    rarities: [...BANDORI_CARD_RARITIES],
    characterIds: [...availableCharacterIds],
    types: [...BANDORI_CARD_CATALOG_TYPES],
    sortBy: "id",
    sortDirection: "asc",
    ...overrides,
  };
}

function run(entries, filter) {
  return filterBandoriCardsPageCatalog(
    entries,
    filter,
    availableBandIds,
    availableCharacterIds,
  );
}

test("available-server fallback starts with the preferred server", () => {
  assert.equal(pickAvailableBandoriServer([0, 1, 2, 3], 3), 3);
  assert.equal(pickAvailableBandoriServer([0, 1, 2], 3), 0);
  assert.equal(pickAvailableBandoriServer([2, 1], 3), 1);
  assert.equal(pickAvailableBandoriServer([], 3), null);
});

test("cards-page projection reuses normalized identity, availability, training, and release fields", () => {
  const catalog = buildBandoriCardsPageCatalog({
    "1": {
      characterId: 21,
      skillId: 7,
      rarity: 4,
      attribute: "cool",
      type: "limited",
      resourceSetName: "res021001",
      levelLimit: 50,
      prefix: ["JP Card", null, null, "CN Card"],
      releasedAt: [100, null, null, 400],
      stat: {
        training: {
          performance: 1,
          levelLimit: 10,
        },
      },
      serverExtensions: [{}, null, null, {}],
    },
  }, {
    "21": {
      bandId: 1,
      nickname: ["JP Character", null, null, "CN Character"],
    },
  }, {}, 3, {
    card: (cardId) => `Card ${cardId}`,
    character: (characterId) => `Character ${characterId}`,
    skill: "Unknown skill",
  });

  assert.equal(catalog.length, 1);
  assert.deepEqual(catalog[0], {
    cardId: 1,
    cardRef: "1",
    entityServer: null,
    availableServers: [0, 3],
    characterId: 21,
    bandId: 1,
    rarity: 4,
    attribute: "cool",
    resourceSetName: "res021001",
    levelLimit: 50,
    trainingLevelLimit: 10,
    hasTrainedArt: true,
    releaseTimestamps: [100, 0, 0, 400],
    displayServer: 3,
    displayCard: {
      characterId: 21,
      skillId: 7,
      rarity: 4,
      attribute: "cool",
      type: "limited",
      resourceSetName: "res021001",
      levelLimit: 50,
      prefix: ["JP Card", null, null, "CN Card"],
      releasedAt: [100, null, null, 400],
      stat: {
        training: {
          performance: 1,
          levelLimit: 10,
        },
      },
    },
    displayName: "CN Card",
    characterName: "CN Character",
    skillEffectLabel: "Unknown skill",
    type: "limited",
    displayReleaseTimestamp: 400,
    filterBandId: 1,
    filterCharacterId: 21,
    filterRarity: 4,
    filterAttribute: "cool",
    filterType: "limited",
    filterSearchText: "cn card cn character",
  });
});

test("exact card IDs retain both registered collision entities", () => {
  const entries = [
    createEntry({
      cardId: 10001,
      cardRef: "10001:en",
      entityServer: 1,
      availableServers: [1],
      displayServer: 1,
      filterBandId: null,
      filterCharacterId: null,
      filterRarity: null,
      filterAttribute: null,
      filterType: null,
      filterSearchText: "",
    }),
    createEntry({
      cardId: 10001,
      cardRef: "10001:cn",
      entityServer: 3,
      availableServers: [3],
      displayServer: 3,
      filterBandId: null,
      filterCharacterId: null,
      filterRarity: null,
      filterAttribute: null,
      filterType: null,
      filterSearchText: "",
    }),
  ];

  assert.deepEqual(
    run(entries, createFilter({ query: "10001" })).map((entry) => entry.cardRef),
    ["10001:cn", "10001:en"],
  );
});

test("availability and localized text filters never fall back implicitly", () => {
  const jpOnly = createEntry({
    availableServers: [0],
    displayName: "これも『最高の夏』",
    filterSearchText: "",
  });

  assert.deepEqual(run([jpOnly], createFilter({ servers: [] })), []);
  assert.deepEqual(
    run([jpOnly], createFilter({ query: "これも『最高の夏』" })),
    [],
  );
  assert.equal(
    run([jpOnly], createFilter({ servers: [0], query: "" })).length,
    1,
  );
});

test("missing release dates remain last in both sort directions", () => {
  const entries = [
    createEntry({ cardId: 1, cardRef: "1", releaseTimestamps: [100, 0, 0, 0] }),
    createEntry({ cardId: 2, cardRef: "2", releaseTimestamps: [200, 0, 0, 0] }),
    createEntry({ cardId: 3, cardRef: "3", releaseTimestamps: [0, 0, 0, 0] }),
  ];

  assert.deepEqual(
    run(entries, createFilter({ sortBy: "release_jp", sortDirection: "asc" }))
      .map((entry) => entry.cardId),
    [1, 2, 3],
  );
  assert.deepEqual(
    run(entries, createFilter({ sortBy: "release_jp", sortDirection: "desc" }))
      .map((entry) => entry.cardId),
    [2, 1, 3],
  );
});
