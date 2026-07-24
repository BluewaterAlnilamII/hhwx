import assert from "node:assert/strict";
import test from "node:test";

import { hasTrainedCardArt } from "../src/lib/bandori-card-training.ts";
import { createMaxGameProfileCard } from "../src/lib/bandori-game-profile-card.ts";
import { buildBandoriCardCatalog } from "../src/components/bandori/card-picker/catalog.ts";

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

test("card catalog and max-profile creation treat zero-only training as untrained", () => {
  const zeroTrainingCard = {
    characterId: 1,
    rarity: 5,
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
});
