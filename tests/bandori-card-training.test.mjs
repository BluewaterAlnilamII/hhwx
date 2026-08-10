import assert from "node:assert/strict";
import test from "node:test";

import {
  hasTrainedCardArt,
  usesBandoriTrainedStarStyle,
} from "../src/lib/bandori-card-training.ts";
import {
  createDefaultOwnedGameProfileCard,
  createMaxGameProfileCard,
} from "../src/lib/bandori-game-profile-card.ts";
import {
  buildBandoriCardCatalog,
  filterBandoriCardCatalog,
  getDefaultTrainType,
  resolveBandoriCardCatalogTrainType,
} from "../src/components/bandori/card-picker/catalog.ts";

test("training art requires at least one positive Master increment", () => {
  assert.equal(hasTrainedCardArt(undefined), false);
  assert.equal(hasTrainedCardArt({ stat: {} }), false);
  assert.equal(hasTrainedCardArt({ stat: { training: null } }), false);
  assert.equal(hasTrainedCardArt({
    stat: {
      training: {
        performance: 0,
        technique: 0,
        visual: 0,
        levelLimit: 0,
      },
    },
  }), false);
  assert.equal(hasTrainedCardArt({
    stat: {
      training: {
        performance: 400,
        technique: 400,
        visual: 400,
        levelLimit: 10,
      },
    },
  }), true);
});

test("training predicate accepts numeric Master strings but rejects invalid values", () => {
  assert.equal(hasTrainedCardArt({
    stat: { training: { levelLimit: "10" } },
  }), true);
  assert.equal(hasTrainedCardArt({
    stat: { training: { levelLimit: "invalid", visual: -1, unexpected: true } },
  }), false);
});

test("Birthday, KiraFes, and after-training art use trained rarity stars", () => {
  assert.equal(usesBandoriTrainedStarStyle("birthday", "normal"), true);
  assert.equal(usesBandoriTrainedStarStyle("kirafes", "normal"), true);
  assert.equal(usesBandoriTrainedStarStyle("permanent", "after_training"), true);
  assert.equal(usesBandoriTrainedStarStyle("permanent", "normal"), false);
});

test("card picker variants follow the asset index instead of Master training stats", () => {
  const cards = {
    "2126": {
      characterId: 26,
      rarity: 4,
      attribute: "cool",
      levelLimit: 50,
      resourceSetName: "res026017",
      stat: {
        training: {
          performance: 0,
          technique: 0,
          visual: 0,
          levelLimit: 0,
        },
      },
    },
    "271": {
      characterId: 1,
      rarity: 4,
      attribute: "powerful",
      levelLimit: 50,
      resourceSetName: "res001012",
      stat: {
        training: {
          performance: 400,
          technique: 400,
          visual: 400,
          levelLimit: 10,
        },
      },
    },
  };
  const characters = {
    "1": { bandId: 1 },
    "26": { bandId: 2 },
  };
  const assetIndex = {
    resources: {
      res026017: { images: { normal: {}, after_training: {} } },
      res001012: { images: { after_training: {} } },
    },
  };
  const catalog = buildBandoriCardCatalog(
    cards,
    characters,
    0,
    false,
    undefined,
    undefined,
    { assetIndex },
  );
  const card2126 = catalog.find((card) => card.cardId === 2126);
  const card271 = catalog.find((card) => card.cardId === 271);

  assert.deepEqual(card2126.availableArtVariants, ["normal", "after_training"]);
  assert.equal(card2126.hasTrainedArt, true);
  assert.deepEqual(card271.availableArtVariants, ["after_training"]);
  assert.equal(getDefaultTrainType(card271), "after_training");
  assert.equal(
    resolveBandoriCardCatalogTrainType(card271, "normal"),
    "after_training",
  );
});

test("card catalog and max-profile creation treat zero-only training as untrained", () => {
  const zeroTrainingCard = {
    characterId: 1,
    rarity: 5,
    type: "kirafes",
    levelLimit: 50,
    resourceSetName: "res001001",
    stat: {
      training: {
        performance: 0,
        technique: 0,
        visual: 0,
        levelLimit: 0,
      },
    },
  };
  const trainedCard = {
    ...zeroTrainingCard,
    resourceSetName: "res001002",
    stat: {
      training: {
        performance: 400,
        technique: 400,
        visual: 400,
        levelLimit: 10,
      },
    },
  };
  const characters = {
    "1": {
      characterName: ["Kasumi", null, null, "香澄"],
    },
  };

  assert.equal(
    buildBandoriCardCatalog({ "1": zeroTrainingCard }, characters)[0].hasTrainedArt,
    false,
  );
  assert.equal(
    buildBandoriCardCatalog({ "1": zeroTrainingCard }, characters)[0].type,
    "kirafes",
  );
  assert.equal(
    buildBandoriCardCatalog({ "2": trainedCard }, characters)[0].hasTrainedArt,
    true,
  );

  const zeroTrainingProfileCard = createMaxGameProfileCard(1, zeroTrainingCard);
  assert.equal(zeroTrainingProfileCard.isTrained, false);
  assert.equal(zeroTrainingProfileCard.hasTrainedArt, false);
  assert.equal(zeroTrainingProfileCard.level, 50);

  const trainedProfileCard = createMaxGameProfileCard(2, trainedCard);
  assert.equal(trainedProfileCard.isTrained, true);
  assert.equal(trainedProfileCard.hasTrainedArt, true);
  assert.equal(trainedProfileCard.level, 60);

  const defaultUntrainedCard = createDefaultOwnedGameProfileCard(1, zeroTrainingCard);
  assert.deepEqual(defaultUntrainedCard, {
    cardId: 1,
    level: 50,
    masterRank: 0,
    skillLevel: 1,
    episodeCount: 2,
    isTrained: false,
    hasTrainedArt: false,
    isExcluded: false,
  });
  const defaultTrainedCard = createDefaultOwnedGameProfileCard(2, trainedCard);
  assert.equal(defaultTrainedCard.level, 60);
  assert.equal(defaultTrainedCard.episodeCount, 2);
  assert.equal(defaultTrainedCard.isTrained, true);
  assert.equal(defaultTrainedCard.hasTrainedArt, true);
  assert.equal(defaultTrainedCard.masterRank, 0);
  assert.equal(defaultTrainedCard.skillLevel, 1);
});

test("card picker catalog sorts by every regional release slot", () => {
  const catalog = buildBandoriCardCatalog({
    "1": {
      characterId: 1,
      rarity: 5,
      attribute: "powerful",
      levelLimit: 50,
      resourceSetName: "res001001",
      releasedAt: [100, 400, 200, 300],
    },
    "2": {
      characterId: 1,
      rarity: 5,
      attribute: "powerful",
      levelLimit: 50,
      resourceSetName: "res001002",
      releasedAt: [200, 100, 500, 600],
    },
    "3": {
      characterId: 1,
      rarity: 5,
      attribute: "powerful",
      levelLimit: 50,
      resourceSetName: "res001003",
      releasedAt: [4102444800000, 4102444800000, 4102444800000, 4102444800000],
    },
  }, {
    "1": {
      bandId: 1,
      characterName: ["Kasumi", null, null, "香澄"],
    },
  });
  const baseFilter = {
    query: "",
    bandIds: [1],
    attributes: ["powerful"],
    rarities: [5],
    characterIds: [1],
    sortDirection: "desc",
  };
  const sortedIds = (sortBy) => filterBandoriCardCatalog(
    catalog,
    { ...baseFilter, sortBy },
  ).map((card) => card.cardId);

  assert.deepEqual(sortedIds("id"), [3, 2, 1]);
  assert.deepEqual(sortedIds("release_jp"), [2, 1]);
  assert.deepEqual(sortedIds("release_en"), [1, 2]);
  assert.deepEqual(sortedIds("release_tw"), [2, 1]);
  assert.deepEqual(sortedIds("release_cn"), [2, 1]);
});
