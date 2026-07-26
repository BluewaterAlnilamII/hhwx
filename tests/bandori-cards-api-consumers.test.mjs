import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  bandoriCardCatalogTransforms,
  buildBandoriCardCatalog,
} from "../src/components/bandori/card-picker/catalog.ts";
import {
  normalizeAccountAvatarCardServer,
  resolveStoredAccountAvatarCardIdentity,
} from "../src/lib/account-avatar-card.ts";
import { pickGameProfileCardName } from "../src/lib/bandori-game-profile-card.ts";
import { normalizeBandoriSkillLabel } from "../src/lib/bandori-skill-label.ts";
import {
  expandBandoriCardCatalog,
  getBandoriCardServerIndex,
  getBandoriCardServerName,
  isKnownBandoriCardEntityCollision,
  materializeBandoriCardForServer,
  materializeBandoriCardMapForServerWithJpFallback,
  normalizeBandoriCardServer,
  parseBandoriCardServerQuery,
  resolveBandoriCardForServer,
  resolveBandoriCardMapForServer,
  resolveBandoriCardMapForServerWithJpFallback,
  validateBandoriCardServerExtensions,
} from "../src/lib/bandori-card-server-extensions.ts";
import {
  getBandoriRegionalDisplayOrder,
  getBandoriRegionalPreferenceOrder,
  normalizeBandoriServer,
  pickBandoriRegionalText,
} from "../src/lib/bandori-server.ts";

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
  assert.throws(
    () => bandoriCardCatalogTransforms.cards({
      success: true,
      data: { payload: { "10048": card } },
    }),
    /invalid card record: payload/u,
  );
  assert.throws(
    () => bandoriCardCatalogTransforms.cards({ success: false }),
    /invalid dataset/u,
  );
});

test("regional display values use preferred server then JP, EN, TW, CN fallback", () => {
  assert.equal(normalizeBandoriServer("0"), 0);
  assert.equal(normalizeBandoriServer("3"), 3);
  assert.equal(normalizeBandoriServer("03"), null);
  assert.equal(normalizeBandoriServer("cn"), null);
  assert.deepEqual(getBandoriRegionalPreferenceOrder(3), [3, 0, 1, 2]);
  assert.deepEqual(getBandoriRegionalPreferenceOrder(2), [2, 0, 1, 3]);
  assert.deepEqual(getBandoriRegionalDisplayOrder(3, 1), [1, 3, 0, 2]);
  assert.deepEqual(getBandoriRegionalDisplayOrder(1, 1), [1, 0, 2, 3]);
  assert.equal(pickBandoriRegionalText(["JP", "EN", "", "CN"], 3), "CN");
  assert.equal(pickBandoriRegionalText(["JP", "EN", "", "CN"], 3, 1), "EN");
  assert.equal(pickBandoriRegionalText(["JP", "EN", "", ""], 3), "JP");
  assert.equal(pickBandoriRegionalText(["", "EN", "", ""], 2), "EN");
  assert.equal(
    pickGameProfileCardName(
      1,
      { prefix: ["JP Card", "EN Card", "TW Card", "CN Card"] },
      3,
      "en",
      1,
    ),
    "EN Card",
  );
  assert.equal(
    normalizeBandoriSkillLabel(
      { description: ["JP skill", "EN skill", "TW skill", "CN skill"] },
      1,
      1,
      3,
      1,
    ),
    "EN skill",
  );
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

test("legacy sparse cards route is deleted", async () => {
  await assert.rejects(
    readSource("src/app/api/bandori/cards/route.ts"),
    /ENOENT/u,
  );
});

test("card consumers share the canonical Cards dataset without the sparse route", async () => {
  const worker = await readSource("src/app/[locale]/bandori/teambuilder/team-search-worker.ts");
  const comments = await readSource("src/lib/comments.ts");
  const profile = await readSource("src/app/api/account/profile/route.ts");
  const avatarControl = await readSource("src/app/[locale]/account/AccountAvatarCardControl.tsx");
  const picker = await readSource("src/components/bandori/card-picker/BandoriCardPicker.tsx");
  const cardsHook = await readSource("src/hooks/useBandoriCardsMaster.ts");
  const temporaryDialogs = await readSource("src/app/[locale]/bandori/teambuilder/TemporaryCardDialogs.tsx");

  assert.match(worker, /type CardsResponse = Record</u);
  assert.match(worker, /normalizeCachedCardsResponse/u);
  assert.match(worker, /getCalculationCardsForProfileServer/u);
  assert.match(worker, /resolvedCardsBySource/u);
  assert.doesNotMatch(comments, /readBandoriCardsApiDataset\(\)/u);
  assert.doesNotMatch(comments, /fetchBestdoriMasterDataset\("cards"\)/u);
  assert.match(profile, /readBandoriCardsApiDataset\(\)/u);
  assert.match(profile, /ACCOUNT_AVATAR_CARD_SERVER_REQUIRED/u);
  assert.match(profile, /materializeBandoriCardForServer/u);
  assert.match(profile, /avatar_card_server: avatarCardServer/u);
  assert.doesNotMatch(profile, /fetchBestdoriMasterDataset\("cards"\)/u);
  assert.match(avatarControl, /avatarCardServer: draftValue\?\.entityServer/u);
  assert.doesNotMatch(avatarControl, /excludeEntityCollisions/u);
  assert.match(
    picker,
    /useBandoriCardsMaster\(\s*server,\s*true,\s*missingCardFallback,\s*\)/u,
  );
  assert.match(picker, /entityServer: card\.entityServer/u);
  assert.doesNotMatch(picker, /\?server=/u);
  assert.match(cardsHook, /"\/api\/bandori\/master\/cards"/u);
  assert.match(temporaryDialogs, /server=\{server\}/u);
});

test("avatar collision identity is persisted and propagated to public avatar consumers", async () => {
  const [
    migration,
    identityMigration,
    schema,
    comments,
    commentTypes,
    commentItem,
    toolbar,
    avatar,
  ] = await Promise.all([
    readSource("supabase/migrations/20260724100812_add_avatar_card_server.sql"),
    readSource("supabase/migrations/20260724185700_enforce_avatar_card_identity.sql"),
    readSource("supabase/schema/auth_schema.sql"),
    readSource("src/lib/comments.ts"),
    readSource("src/app/[locale]/bandori/eventtracker/commentTypes.ts"),
    readSource("src/app/[locale]/bandori/eventtracker/CommentItem.tsx"),
    readSource("src/components/Toolbar.tsx"),
    readSource("src/components/account/AccountCardAvatar.tsx"),
  ]);

  assert.match(migration, /ADD COLUMN IF NOT EXISTS avatar_card_server SMALLINT/u);
  assert.match(migration, /avatar_card_server IN \(1, 3\)/u);
  assert.match(identityMigration, /avatar_card_id BETWEEN 10001 AND 10010/u);
  assert.match(identityMigration, /avatar_card_id NOT BETWEEN 10001 AND 10010/u);
  assert.match(identityMigration, /NOTIFY pgrst, 'reload schema'/u);
  assert.match(schema, /avatar_card_server\s+SMALLINT/u);
  assert.match(comments, /avatar_card_server/u);
  assert.match(commentTypes, /entityServer: BandoriServer \| null/u);
  assert.match(commentItem, /entityServer=\{comment\.avatar\.entityServer\}/u);
  assert.match(toolbar, /avatarCardServer/u);
  assert.match(avatar, /useBandoriCardsMaster\(\s*entityServer \?\? undefined/u);
});

test("avatar entity normalization keeps only explicit EN/CN collision identities", () => {
  assert.equal(normalizeAccountAvatarCardServer(10001, 1), 1);
  assert.equal(normalizeAccountAvatarCardServer(10001, "3"), 3);
  assert.equal(normalizeAccountAvatarCardServer(10001, 0), null);
  assert.equal(normalizeAccountAvatarCardServer(9999, 3), null);
  assert.deepEqual(resolveStoredAccountAvatarCardIdentity(10001, null), {
    cardId: 1,
    entityServer: null,
  });
  assert.deepEqual(resolveStoredAccountAvatarCardIdentity(10001, 3), {
    cardId: 10001,
    entityServer: 3,
  });
  assert.deepEqual(resolveStoredAccountAvatarCardIdentity(9999, 3), {
    cardId: 9999,
    entityServer: null,
  });
});

test("profile-bound card displays receive profile server context without changing event bonus cards", async () => {
  const [
    profileCardsPage,
    teamBuilderPage,
    preferencesPanel,
    preferenceEntries,
    temporaryDialogs,
  ] = await Promise.all([
    readSource("src/app/[locale]/bandori/game-profiles/[profileId]/cards/page.tsx"),
    readSource("src/app/[locale]/bandori/teambuilder/page.tsx"),
    readSource("src/app/[locale]/bandori/teambuilder/CardPreferencesPanel.tsx"),
    readSource("src/app/[locale]/bandori/teambuilder/useTeamBuilderPreferenceCardEntries.ts"),
    readSource("src/app/[locale]/bandori/teambuilder/TemporaryCardDialogs.tsx"),
  ]);

  assert.match(profileCardsPage, /displayServer=\{profileServer\}/u);
  assert.match(profileCardsPage, /preferredServer,\s*profileServer,\s*fallbackLabels/u);
  assert.match(teamBuilderPage, /displayServer=\{selectedProfileCardServer\}/u);
  assert.match(teamBuilderPage, /canonicalData: canonicalCards/u);
  assert.match(teamBuilderPage, /useBandoriCardsMaster\(selectedProfileCardServer, true, "jp"\)/u);
  assert.match(teamBuilderPage, /<EventBonusPanel[\s\S]*?cardMetadata=\{canonicalCardMetadata\}/u);
  assert.match(teamBuilderPage, /<TeamBuilderCardPreferencesPanel[\s\S]*?cardMetadata=\{profileCardMetadata\}/u);
  assert.match(preferencesPanel, /displayServer: BandoriServer/u);
  assert.match(preferenceEntries, /contextServer: BandoriServer/u);
  assert.match(temporaryDialogs, /missingCardFallback="jp"/u);

  const bonusCardBody = teamBuilderPage.slice(
    teamBuilderPage.indexOf("function BonusCardThumbnail"),
    teamBuilderPage.indexOf("function TeamBuilderCardTile"),
  );
  assert.doesNotMatch(bonusCardBody, /displayServer=/u);
});

test("team builder includes every JP card missing from another server without using release dates", () => {
  const jpOnlyCard = {
    characterId: 1,
    rarity: 5,
    releasedAt: [100, null, null, null],
    resourceSetName: "res001999",
    skillId: 10,
    serverExtensions: [{}, null, null, null],
  };
  const regionalCard = {
    characterId: 2,
    rarity: 5,
    releasedAt: [200, 300, null, null],
    resourceSetName: "res002999",
    skillId: 20,
    serverExtensions: [{}, { skillId: 21 }, null, null],
  };
  const cnOnlyCard = {
    characterId: 3,
    rarity: 2,
    releasedAt: [null, null, null, 50],
    resourceSetName: "res003999",
    skillId: 30,
    serverExtensions: [null, null, null, {}],
  };
  const cards = {
    "1": jpOnlyCard,
    "2": regionalCard,
    "3": cnOnlyCard,
  };

  assert.deepEqual(resolveBandoriCardMapForServer(cards, 1), {
    "2": {
      characterId: 2,
      rarity: 5,
      releasedAt: [200, 300, null, null],
      resourceSetName: "res002999",
      skillId: 21,
    },
  });
  const enCards = resolveBandoriCardMapForServerWithJpFallback(cards, 1);
  assert.equal(enCards["1"], jpOnlyCard);
  assert.equal(enCards["2"].skillId, 21);
  assert.equal(enCards["3"], undefined);

  assert.deepEqual(materializeBandoriCardMapForServerWithJpFallback(cards, 3), {
    "1": {
      characterId: 1,
      rarity: 5,
      releasedAt: [100, null, null, null],
      resourceSetName: "res001999",
      skillId: 10,
    },
    "2": {
      characterId: 2,
      rarity: 5,
      releasedAt: [200, 300, null, null],
      resourceSetName: "res002999",
      skillId: 20,
    },
    "3": {
      characterId: 3,
      rarity: 2,
      releasedAt: [null, null, null, 50],
      resourceSetName: "res003999",
      skillId: 30,
    },
  });

  const collision = {
    characterId: 21,
    rarity: 2,
    resourceSetName: "res021500",
    type: "campaign",
    serverExtensions: [null, {}, null, {
      characterId: 22,
      resourceSetName: "res022900",
      type: "limited",
    }],
  };
  assert.deepEqual(resolveBandoriCardMapForServerWithJpFallback({ "10001": collision }, 2), {});
});

test("avatar picker expands every registered collision into distinct EN and CN resources", () => {
  const resources = [
    [10001, 21, "res021500", 22, "res022900"],
    [10002, 22, "res022500", 5, "res005900"],
    [10003, 23, "res023500", 7, "res007900"],
    [10004, 24, "res024500", 13, "res013900"],
    [10005, 25, "res025500", 16, "res016900"],
    [10006, 5, "res005501", 24, "res024900"],
    [10007, 24, "res024501", 18, "res018900"],
    [10008, 17, "res017501", 14, "res014900"],
    [10009, 11, "res011501", 18, "res018901"],
    [10010, 13, "res013501", 25, "res025900"],
  ];
  const cards = Object.fromEntries(resources.map(([
    cardId,
    enCharacterId,
    enResourceSetName,
    cnCharacterId,
    cnResourceSetName,
  ]) => [String(cardId), {
    characterId: enCharacterId,
    skillId: 1,
    rarity: 2,
    attribute: "powerful",
    levelLimit: 30,
    resourceSetName: enResourceSetName,
    prefix: ["", `EN ${cardId}`, "", `CN ${cardId}`],
    releasedAt: [null, 1, null, 1],
    stat: {},
    type: "campaign",
    serverExtensions: [
      null,
      {},
      null,
      {
        characterId: cnCharacterId,
        resourceSetName: cnResourceSetName,
        type: "limited",
      },
    ],
  }]));
  const characters = Object.fromEntries(
    Array.from(new Set(resources.flatMap(([, enCharacterId, , cnCharacterId]) => [
      enCharacterId,
      cnCharacterId,
    ]))).map((characterId) => [String(characterId), {
      bandId: 1,
      nickname: ["", `EN Character ${characterId}`, "", `CN Character ${characterId}`],
    }]),
  );

  const catalog = buildBandoriCardCatalog(cards, characters, 3, "zh-CN", true);
  assert.equal(catalog.length, 20);
  for (const [cardId, , enResourceSetName, , cnResourceSetName] of resources) {
    const entries = catalog.filter((entry) => entry.cardId === cardId);
    assert.deepEqual(entries.map((entry) => entry.cardRef).sort(), [
      `1:${cardId}`,
      `3:${cardId}`,
    ]);
    assert.deepEqual(entries.map((entry) => entry.resourceSetName).sort(), [
      enResourceSetName,
      cnResourceSetName,
    ].sort());
  }
});

test("all Master consumers reuse the positive-increment training predicate", async () => {
  const paths = [
    "src/components/bandori/card-picker/catalog.ts",
    "src/app/api/account/profile/route.ts",
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

  assert.equal(normalizeBandoriCardServer("3"), 3);
  assert.equal(normalizeBandoriCardServer("03"), null);
  assert.equal(normalizeBandoriCardServer("cn"), null);
  assert.equal(normalizeBandoriCardServer("kr"), null);
  assert.equal(getBandoriCardServerIndex(2), 2);
  assert.equal(getBandoriCardServerName(3), "cn");
  assert.deepEqual(
    parseBandoriCardServerQuery(new Request("https://example.test/api/cards?server=3")),
    { status: "valid", server: 3 },
  );
  assert.deepEqual(
    parseBandoriCardServerQuery(new Request("https://example.test/api/cards?server=3&server=1")),
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
    { cardId: 10001, cardRef: "1:10001", server: 1 },
    { cardId: 10001, cardRef: "3:10001", server: 3 },
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
