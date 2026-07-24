import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { bandoriCardCatalogTransforms } from "../src/components/bandori/card-picker/catalog.ts";
import {
  expandBandoriCardCatalog,
  getBandoriCardServerIndex,
  getBandoriCardServerName,
  isKnownBandoriCardEntityCollision,
  materializeBandoriCardForServer,
  normalizeBandoriCardServer,
  parseBandoriCardServerQuery,
  resolveBandoriCardForServer,
  resolveBandoriCardMapForServer,
  validateBandoriCardServerExtensions,
} from "../src/lib/bandori-card-server-extensions.ts";

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("card picker consumes cards directly from the API data envelope", () => {
  const card = {
    characterId: 1,
    rarity: 5,
    resourceSetName: "res001",
  };

  assert.deepEqual(
    bandoriCardCatalogTransforms.cards({ success: true, data: { "10048": card } }),
    { "10048": card },
  );
  assert.deepEqual(
    bandoriCardCatalogTransforms.cards({ success: true, data: { payload: { "10048": card } } }),
    { "10048": card },
  );
  assert.deepEqual(bandoriCardCatalogTransforms.cards({ success: false }), {});
});

test("master cards list and detail routes expose direct data without storage metadata", async () => {
  const listRoute = await readSource("src/app/api/bandori/master/[dataset]/route.ts");
  const detailRoute = await readSource("src/app/api/bandori/master/cards/[cardId]/route.ts");

  assert.match(listRoute, /readBandoriCardsApiDatasetForServer/u);
  assert.match(listRoute, /return jsonSuccess\(cards,/u);
  assert.doesNotMatch(listRoute, /jsonSuccess\(\{[^}]*payload/u);
  assert.match(detailRoute, /readBandoriCardApiDetailForServer/u);
  assert.match(detailRoute, /return jsonSuccess\(result,/u);
  assert.doesNotMatch(detailRoute, /jsonSuccess\(\{\s*\.\.\.result,\s*cardId\s*\}/u);
});

test("sparse cards route preserves its cards wrapper and has no Bestdori fallback", async () => {
  const route = await readSource("src/app/api/bandori/cards/route.ts");

  assert.match(route, /readBandoriCardsApiDataset\(\)/u);
  assert.match(route, /return jsonSuccess\(\{ cards \},/u);
  assert.doesNotMatch(route, /bestdori\.com|BESTDORI_CARDS_URL|fetch\(/iu);
});

test("card consumers use direct data while tolerating stale cached wrappers", async () => {
  const worker = await readSource("src/app/[locale]/bandori/teambuilder/team-search-worker.ts");
  const comments = await readSource("src/lib/comments.ts");
  const profile = await readSource("src/app/api/account/profile/route.ts");
  const avatarControl = await readSource("src/app/[locale]/account/AccountAvatarCardControl.tsx");
  const picker = await readSource("src/components/bandori/card-picker/BandoriCardPicker.tsx");
  const temporaryDialogs = await readSource("src/app/[locale]/bandori/teambuilder/TemporaryCardDialogs.tsx");

  assert.match(worker, /type CardsResponse = Record</u);
  assert.match(worker, /normalizeCachedCardsResponse/u);
  assert.match(worker, /getCardsForServer/u);
  assert.match(worker, /resolvedCardsBySource/u);
  assert.match(comments, /readBandoriCardsApiDataset\(\)/u);
  assert.doesNotMatch(comments, /fetchBestdoriMasterDataset\("cards"\)/u);
  assert.match(profile, /readBandoriCardsApiDataset\(\)/u);
  assert.match(profile, /ACCOUNT_AVATAR_CARD_SERVER_REQUIRED/u);
  assert.doesNotMatch(profile, /fetchBestdoriMasterDataset\("cards"\)/u);
  assert.match(avatarControl, /excludeEntityCollisions/u);
  assert.match(picker, /\?server=\$\{server\}/u);
  assert.match(temporaryDialogs, /server=\{server\}/u);
});

test("all Master consumers reuse the positive-increment training predicate", async () => {
  const paths = [
    "src/components/bandori/card-picker/catalog.ts",
    "src/app/api/bandori/cards/route.ts",
    "src/app/api/account/profile/route.ts",
    "src/lib/comments.ts",
    "src/lib/bandori-game-profile-card.ts",
    "src/app/[locale]/bandori/teambuilder/team-search-worker.ts",
  ];
  const sources = await Promise.all(paths.map(readSource));

  for (const source of sources) {
    assert.match(source, /hasTrainedCardArt/u);
    assert.doesNotMatch(source, /Boolean\([^)]*stat\?\.training/u);
    assert.doesNotMatch(source, /typeof [^\n]*training === "object"/u);
    assert.doesNotMatch(source, /isRecord\([^\n]*stat\.training/u);
  }
});

test("card server extensions use fixed four-slot shallow overrides", () => {
  const canonicalStat = {
    "1": { performance: 1, technique: 2, visual: 3 },
    training: { performance: 0, technique: 0, visual: 0 },
  };
  const enStat = {
    "1": { performance: 1, technique: 3, visual: 2 },
  };
  const card = {
    characterId: 1,
    attribute: "cool",
    skillId: 4,
    type: "limited",
    stat: canonicalStat,
    serverExtensions: [
      {},
      { episodes: null, stat: enStat },
      { attribute: "powerful", skillId: 7 },
      null,
    ],
    episodes: [{ title: "canonical" }],
  };

  validateBandoriCardServerExtensions(card);
  assert.equal(resolveBandoriCardForServer(card, 0), card);
  const enCard = resolveBandoriCardForServer(card, 1);
  assert.deepEqual(enCard?.stat, enStat);
  assert.equal(Object.hasOwn(enCard, "episodes"), false);
  assert.deepEqual(resolveBandoriCardForServer(card, 2), {
    characterId: 1,
    attribute: "powerful",
    skillId: 7,
    type: "limited",
    stat: canonicalStat,
    episodes: [{ title: "canonical" }],
  });
  assert.equal(resolveBandoriCardForServer(card, 3), null);
  assert.deepEqual(resolveBandoriCardMapForServer({ "1": card }, 3), {});
  assert.equal(card.attribute, "cool");
  assert.equal(card.skillId, 4);
  assert.deepEqual(card.episodes, [{ title: "canonical" }]);
});

test("card server extensions reject ambiguous or unsafe shapes", () => {
  assert.throws(
    () => validateBandoriCardServerExtensions({ serverExtensions: [{}, {}, {}] }),
    /exactly four/u,
  );
  assert.throws(
    () => validateBandoriCardServerExtensions({
      serverExtensions: [{}, { type: "permanent" }, {}, {}],
    }),
    /must not override type/u,
  );
  assert.throws(
    () => validateBandoriCardServerExtensions({
      serverExtensions: [{}, { characterId: null }, {}, {}],
    }),
    /unsupported field: characterId/u,
  );
  assert.throws(
    () => validateBandoriCardServerExtensions({
      serverExtensions: [{}, { unknown: 1 }, {}, {}],
    }),
    /unsupported field: unknown/u,
  );
  assert.throws(
    () => validateBandoriCardServerExtensions(
      { serverExtensions: [{}, {}, { skillId: 3 }, {}] },
      "card 1",
      { dataset: "cards", recordId: "1" },
    ),
    /unregistered serverExtensions field: skillId/u,
  );
  assert.doesNotThrow(
    () => validateBandoriCardServerExtensions(
      { serverExtensions: [{}, {}, { episodes: null, stat: {} }, {}] },
      "card 510",
      { dataset: "cardDetails", recordId: "510" },
    ),
  );
  assert.throws(
    () => resolveBandoriCardForServer({ serverExtensions: [{}, {}, {}, {}] }, 4),
    /Unsupported Bandori card server index/u,
  );
  const staleCanonical = { skillId: 4 };
  assert.equal(resolveBandoriCardForServer(staleCanonical, 2), staleCanonical);
});

test("registered same-ID collisions keep numeric card IDs and expand to server-scoped refs", () => {
  const collision = {
    characterId: 21,
    rarity: 2,
    resourceSetName: "res021500",
    type: "campaign",
    serverExtensions: [
      null,
      {},
      null,
      {
        characterId: 22,
        resourceSetName: "res022900",
        type: "limited",
      },
    ],
  };
  const ordinary = {
    characterId: 1,
    rarity: 5,
    resourceSetName: "res000001",
    type: "permanent",
    serverExtensions: [{}, {}, {}, {}],
  };

  assert.equal(normalizeBandoriCardServer(" CN "), "cn");
  assert.equal(normalizeBandoriCardServer("kr"), null);
  assert.equal(getBandoriCardServerIndex("tw"), 2);
  assert.equal(getBandoriCardServerName(3), "cn");
  assert.deepEqual(
    parseBandoriCardServerQuery(new Request("https://example.test/api/cards?server=cn")),
    { status: "valid", server: "cn" },
  );
  assert.deepEqual(
    parseBandoriCardServerQuery(new Request("https://example.test/api/cards?server=cn&server=en")),
    { status: "invalid" },
  );
  assert.deepEqual(
    parseBandoriCardServerQuery(new Request("https://example.test/api/cards?foo=bar")),
    { status: "unsupported" },
  );
  assert.equal(isKnownBandoriCardEntityCollision(10001), true);
  assert.equal(isKnownBandoriCardEntityCollision("10000"), false);
  assert.doesNotThrow(() => validateBandoriCardServerExtensions(
    collision,
    "card 10001",
    { dataset: "cards", recordId: "10001" },
  ));
  assert.doesNotThrow(() => validateBandoriCardServerExtensions(
    {
      ...collision,
      sdResourceName: "sd021500",
      serverExtensions: [
        null,
        {},
        null,
        {
          characterId: 22,
          resourceSetName: "res022900",
          sdResourceName: "sd022002",
          type: "limited",
        },
      ],
    },
    "cardDetails 10001",
    { dataset: "cardDetails", recordId: "10001" },
  ));
  assert.deepEqual(materializeBandoriCardForServer(collision, 3), {
    characterId: 22,
    rarity: 2,
    resourceSetName: "res022900",
    type: "limited",
  });

  const catalog = expandBandoriCardCatalog({
    "10001": collision,
    "1": ordinary,
  });
  assert.deepEqual(catalog.map(({ cardId, cardRef, server }) => ({
    cardId,
    cardRef,
    server,
  })), [
    { cardId: 1, cardRef: "1", server: null },
    { cardId: 10001, cardRef: "en:10001", server: "en" },
    { cardId: 10001, cardRef: "cn:10001", server: "cn" },
  ]);
  assert.deepEqual(catalog[1].card, {
    characterId: 21,
    rarity: 2,
    resourceSetName: "res021500",
    type: "campaign",
  });
  assert.equal(catalog[2].card.characterId, 22);
});

test("same-ID collision validation stays fail-closed outside its exact EN/CN contract", () => {
  const base = {
    characterId: 21,
    rarity: 2,
    resourceSetName: "res021500",
    type: "campaign",
  };
  assert.throws(
    () => validateBandoriCardServerExtensions(
      {
        ...base,
        serverExtensions: [{}, {}, null, { characterId: 22 }],
      },
      "card 10001",
      { dataset: "cards", recordId: "10001" },
    ),
    /must only exist on EN and CN/u,
  );
  assert.throws(
    () => validateBandoriCardServerExtensions(
      {
        ...base,
        serverExtensions: [null, {}, null, { costumeId: 100 }],
      },
      "card 10001",
      { dataset: "cards", recordId: "10001" },
    ),
    /unsupported entity collision field: costumeId/u,
  );
  assert.throws(
    () => validateBandoriCardServerExtensions(
      {
        ...base,
        serverExtensions: [null, {}, null, { skillId: 3 }],
      },
      "card 10001",
      { dataset: "cards", recordId: "10001" },
    ),
    /must override an identity field/u,
  );
  assert.throws(
    () => validateBandoriCardServerExtensions(
      {
        ...base,
        serverExtensions: [null, {}, null, { characterId: 22 }],
      },
      "card 10011",
      { dataset: "cards", recordId: "10011" },
    ),
    /unregistered serverExtensions field: characterId/u,
  );
  assert.throws(
    () => validateBandoriCardServerExtensions(
      {
        ...base,
        characterId: 20,
        serverExtensions: [null, {}, null, {
          characterId: 22,
          resourceSetName: "res022900",
        }],
      },
      "card 10001",
      { dataset: "cards", recordId: "10001" },
    ),
    /identity fingerprint changed: server=en, field=characterId/u,
  );
});
