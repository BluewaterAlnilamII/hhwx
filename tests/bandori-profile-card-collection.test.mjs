import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { encodeBestdoriProfile } from "../src/lib/bestdori-profile-codec.ts";
import { areGameProfileCardsEqual } from "../src/lib/bandori-game-profile-card.ts";
import { BANDORI_CHARACTER_GROUPS } from "../src/lib/bandori-character-groups.ts";
import {
  buildDefaultBandoriProfileCardFilter,
  filterAndSortBandoriProfileCardEntries,
  summarizeGameProfileCardChanges,
} from "../src/lib/bandori-profile-card-collection.ts";
import {
  buildBandoriCardFilterOptions,
  buildBandoriCardSortValues,
  getBandoriCardReleaseSortServer,
  isBandoriCardAttribute,
  normalizeBandoriCardReleaseSortTimestamp,
  reconcileBandoriCardFilterSelection,
} from "../src/lib/bandori-card-filter.ts";
import {
  getGameProfileCards,
  replaceGameProfileCards,
} from "../src/lib/user-game-profile-payload.ts";
import {
  patchUserGameProfileCards,
  UserGameProfileCardsPatchError,
} from "../src/lib/user-game-profile-cards-client.ts";
import {
  reduceGameProfileCardDraft,
} from "../src/app/[locale]/bandori/game-profiles/[profileId]/cards/useGameProfileCardDraft.ts";

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

function card(cardId, overrides = {}) {
  return {
    cardId,
    level: 60,
    masterRank: 0,
    skillLevel: 1,
    episodeCount: 2,
    isTrained: true,
    hasTrainedArt: true,
    isExcluded: false,
    ...overrides,
  };
}

function entry(cardId, overrides = {}) {
  const profileCard = card(cardId, overrides.card);
  return {
    card: profileCard,
    metadata: {
      releasedAt: [cardId * 100, cardId * 80, cardId * 60, cardId === 3 ? null : cardId * 10],
      ...overrides.metadata,
    },
    bandId: overrides.bandId === undefined ? 1 : overrides.bandId,
    characterId: overrides.characterId === undefined ? 1 : overrides.characterId,
    attribute: overrides.attribute === undefined ? "powerful" : overrides.attribute,
    rarity: overrides.rarity === undefined ? 5 : overrides.rarity,
    totalPower: overrides.totalPower ?? cardId * 100,
    cardName: overrides.cardName ?? `Card ${cardId}`,
    characterName: overrides.characterName ?? `Character ${overrides.characterId ?? 1}`,
    skillEffectLabel: "Skill",
    searchText: overrides.searchText ?? `card ${cardId} character ${overrides.characterId ?? 1}`,
  };
}

test("card equality and change summaries compare every persisted field without caring about order", () => {
  const base = card(1);
  assert.equal(areGameProfileCardsEqual(base, { ...base }), true);
  for (const [field, value] of [
    ["cardId", 2],
    ["level", 59],
    ["masterRank", 1],
    ["skillLevel", 2],
    ["episodeCount", 1],
    ["isTrained", false],
    ["hasTrainedArt", false],
    ["isExcluded", true],
  ]) {
    assert.equal(areGameProfileCardsEqual(base, { ...base, [field]: value }), false, field);
  }

  const saved = [card(1), card(2)];
  assert.deepEqual(summarizeGameProfileCardChanges(saved, [...saved].reverse()), {
    added: 0,
    updated: 0,
    removed: 0,
    total: 0,
  });
  assert.deepEqual(summarizeGameProfileCardChanges(saved, [card(1, { level: 50 }), card(3)]), {
    added: 1,
    updated: 1,
    removed: 1,
    total: 3,
  });
  assert.equal(summarizeGameProfileCardChanges(saved, saved).total, 0);
  assert.equal(summarizeGameProfileCardChanges(saved, [...saved, card(3)].filter((item) => item.cardId !== 3)).total, 0);
});

test("profile card filtering covers every dimension, sort, direction, and missing metadata policy", () => {
  const entries = [
    entry(1, { totalPower: 100, searchText: "kasumi powerful", card: { isTrained: false, hasTrainedArt: false } }),
    entry(2, { totalPower: 300, bandId: 2, characterId: 2, attribute: "cool", rarity: 4, searchText: "ran cool" }),
    entry(3, { totalPower: 200, characterId: 2, attribute: "pure", rarity: 3, searchText: "aya pure" }),
    entry(4, { totalPower: 50, bandId: null, characterId: null, attribute: null, rarity: null, searchText: "legacy card" }),
  ];
  const availableBandIds = [1, 2];
  const availableCharacterIds = [1, 2];
  const defaults = buildDefaultBandoriProfileCardFilter(availableBandIds, availableCharacterIds);
  const run = (patch, unknownMetadataPolicy = "exclude") => filterAndSortBandoriProfileCardEntries(
    entries,
    { ...defaults, ...patch },
    { availableBandIds, availableCharacterIds, unknownMetadataPolicy },
  ).map((item) => item.card.cardId);

  assert.deepEqual(run({ query: "ran" }), [2]);
  assert.deepEqual(run({ bandIds: [2] }), [2]);
  assert.deepEqual(run({ attributes: ["pure"] }), [3]);
  assert.deepEqual(run({ rarities: [4] }), [2]);
  assert.deepEqual(run({ characterIds: [1] }), [1]);
  assert.deepEqual(run({ sortBy: "power", sortDirection: "desc" }), [2, 3, 1]);
  assert.deepEqual(run({ sortBy: "power", sortDirection: "asc" }), [1, 3, 2]);
  assert.deepEqual(run({ sortBy: "release_jp", sortDirection: "desc" }), [3, 2, 1]);
  assert.deepEqual(run({ sortBy: "release_en", sortDirection: "desc" }), [3, 2, 1]);
  assert.deepEqual(run({ sortBy: "release_tw", sortDirection: "asc" }), [1, 2, 3]);
  assert.deepEqual(run({ sortBy: "release_cn", sortDirection: "desc" }), [2, 1]);
  assert.deepEqual(run({ sortBy: "id", sortDirection: "asc" }), [1, 2, 3]);
  assert.deepEqual(run({}, "include-when-unfiltered"), [2, 3, 1, 4]);
  assert.deepEqual(run({ bandIds: [1] }, "include-when-unfiltered"), [3, 1]);
});

test("shared sort values follow product priority and server context", () => {
  assert.deepEqual(
    buildBandoriCardSortValues({ shouldIncludePower: false }),
    ["id", "release_jp", "release_en", "release_tw", "release_cn"],
  );
  assert.deepEqual(
    buildBandoriCardSortValues({ shouldIncludePower: true, contextServer: null }),
    ["power", "id", "release_jp", "release_en", "release_tw", "release_cn"],
  );
  assert.deepEqual(
    buildBandoriCardSortValues({ shouldIncludePower: true, contextServer: 0 }),
    ["power", "id", "release_jp"],
  );
  assert.deepEqual(
    buildBandoriCardSortValues({ shouldIncludePower: true, contextServer: 1 }),
    ["power", "id", "release_jp", "release_en"],
  );
  assert.deepEqual(
    buildBandoriCardSortValues({ shouldIncludePower: false, contextServer: 2 }),
    ["id", "release_jp", "release_tw"],
  );
  assert.deepEqual(
    buildBandoriCardSortValues({ shouldIncludePower: false, contextServer: 3 }),
    ["id", "release_jp", "release_cn"],
  );
  assert.equal(getBandoriCardReleaseSortServer("release_jp"), 0);
  assert.equal(getBandoriCardReleaseSortServer("release_en"), 1);
  assert.equal(getBandoriCardReleaseSortServer("release_tw"), 2);
  assert.equal(getBandoriCardReleaseSortServer("release_cn"), 3);
  assert.equal(getBandoriCardReleaseSortServer("power"), null);
});

test("all servers exclude placeholder dates from release sorting", () => {
  const placeholderTimestamp = Date.UTC(2100, 0, 1);
  assert.equal(normalizeBandoriCardReleaseSortTimestamp(placeholderTimestamp - 1), placeholderTimestamp - 1);
  assert.equal(normalizeBandoriCardReleaseSortTimestamp(placeholderTimestamp), 0);
  assert.equal(normalizeBandoriCardReleaseSortTimestamp(placeholderTimestamp + 1), 0);
  assert.equal(normalizeBandoriCardReleaseSortTimestamp(null), 0);

  const placeholderEntry = entry(5, {
    metadata: {
      releasedAt: [
        placeholderTimestamp,
        placeholderTimestamp,
        placeholderTimestamp,
        placeholderTimestamp,
      ],
    },
  });
  const defaults = buildDefaultBandoriProfileCardFilter([1], [1]);
  const run = (sortBy) => filterAndSortBandoriProfileCardEntries(
    [entry(1), placeholderEntry],
    { ...defaults, sortBy },
    { availableBandIds: [1], availableCharacterIds: [1], unknownMetadataPolicy: "exclude" },
  ).map((item) => item.card.cardId);

  assert.deepEqual(run("id"), [5, 1]);
  for (const sortBy of ["release_jp", "release_en", "release_tw", "release_cn"]) {
    assert.deepEqual(run(sortBy), [1], sortBy);
  }
});

test("shared filter options come from global character Master instead of current cards", () => {
  const options = buildBandoriCardFilterOptions({
    "1": { bandId: 1, characterName: ["Kasumi", "Kasumi EN", null, "Kasumi CN"] },
    "2": { bandId: 2 },
    "3": { bandId: 99, characterName: "Fallback band member" },
    invalid: { bandId: 1 },
  }, {
    preferredServer: 3,
    contextServer: 1,
    getBandLabel: (bandId) => `Band fallback ${bandId}`,
    getCharacterLabel: (characterId) => `Character fallback ${characterId}`,
  });
  assert.deepEqual(options.bandIds, [1, 2, 99]);
  assert.deepEqual(options.bandOptions.at(-1), { bandId: 99, label: "Band fallback 99" });
  assert.deepEqual(options.characterIds, [1, 2, 3]);
  assert.deepEqual(options.characterOptions, [
    { characterId: 1, label: "Kasumi EN" },
    { characterId: 2, label: "Character fallback 2" },
    { characterId: 3, label: "Fallback band member" },
  ]);
});

test("an empty card collection still exposes every global band and character option", () => {
  const characters = Object.fromEntries(BANDORI_CHARACTER_GROUPS.flatMap((group) => (
    group.characterIds.map((characterId) => [String(characterId), {
      bandId: group.bandId,
      characterName: [`JP ${characterId}`, `EN ${characterId}`, null, `CN ${characterId}`],
    }])
  )));
  const options = buildBandoriCardFilterOptions(characters, {
    preferredServer: 3,
    contextServer: 3,
    getBandLabel: (bandId) => `Band ${bandId}`,
    getCharacterLabel: (characterId) => `Character ${characterId}`,
  });

  assert.deepEqual(BANDORI_CHARACTER_GROUPS.flatMap((group) => group.characterIds),
    Array.from({ length: 40 }, (_, index) => index + 1));
  assert.deepEqual(options.bandIds, [1, 2, 3, 4, 5, 18, 21, 45]);
  assert.equal(options.characterOptions.length, 40);
  assert.equal(options.characterOptions[0].label, "CN 1");
  assert.equal(options.characterOptions.at(-1).label, "CN 40");
});

test("shared filter selections include new options only when the previous options were all selected", () => {
  assert.deepEqual(
    reconcileBandoriCardFilterSelection([1, 2], [1, 2], [1, 2, 3]),
    [1, 2, 3],
  );
  assert.deepEqual(
    reconcileBandoriCardFilterSelection([1], [1, 2], [1, 2, 3]),
    [1],
  );
  assert.deepEqual(
    reconcileBandoriCardFilterSelection([1, 2], [1, 2], [1, 3]),
    [1, 3],
  );
  assert.deepEqual(
    reconcileBandoriCardFilterSelection([], [], [1, 2]),
    [1, 2],
  );
  assert.equal(isBandoriCardAttribute("pure"), true);
  assert.equal(isBandoriCardAttribute("unknown"), false);
});

test("draft reducer supports apply, remove, discard, and mark-saved without cloning card records", () => {
  const original = [card(1), card(2)];
  let state = reduceGameProfileCardDraft({ savedCards: [], draftCards: [] }, { type: "reset", cards: original });
  assert.equal(state.savedCards, original);
  assert.equal(state.draftCards, original);

  const changed = card(1, { skillLevel: 2 });
  state = reduceGameProfileCardDraft(state, { type: "apply", card: changed });
  assert.equal(state.draftCards[0], changed);
  assert.equal(summarizeGameProfileCardChanges(state.savedCards, state.draftCards).updated, 1);

  state = reduceGameProfileCardDraft(state, { type: "apply", card: original[0] });
  assert.equal(summarizeGameProfileCardChanges(state.savedCards, state.draftCards).total, 0);
  state = reduceGameProfileCardDraft(state, { type: "apply", card: card(3) });
  state = reduceGameProfileCardDraft(state, { type: "remove", cardId: 3 });
  assert.equal(summarizeGameProfileCardChanges(state.savedCards, state.draftCards).total, 0);
  state = reduceGameProfileCardDraft(state, { type: "remove", cardId: 2 });
  assert.equal(summarizeGameProfileCardChanges(state.savedCards, state.draftCards).removed, 1);
  state = reduceGameProfileCardDraft(state, { type: "discard" });
  assert.equal(state.draftCards, state.savedCards);
  const saved = [card(1, { level: 50 })];
  state = reduceGameProfileCardDraft(state, { type: "mark-saved", cards: saved });
  assert.equal(state.savedCards, saved);
  assert.equal(state.draftCards, saved);
});

test("draft interactions issue no PATCH and one explicit save issues exactly one PATCH", async () => {
  const requests = [];
  const fetcher = async (input, init) => {
    requests.push({ input: String(input), init });
    return new Response(JSON.stringify({
      success: true,
      data: { sectionVersions: { cardsHash: "next-cards-hash" } },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  let state = reduceGameProfileCardDraft(
    { savedCards: [], draftCards: [] },
    { type: "reset", cards: [card(1), card(2)] },
  );
  state = reduceGameProfileCardDraft(state, { type: "apply", card: card(1, { skillLevel: 2 }) });
  state = reduceGameProfileCardDraft(state, { type: "apply", card: card(3) });
  state = reduceGameProfileCardDraft(state, { type: "remove", cardId: 2 });
  filterAndSortBandoriProfileCardEntries(
    [entry(1), entry(3)],
    buildDefaultBandoriProfileCardFilter([1], [1]),
    { availableBandIds: [1], availableCharacterIds: [1], unknownMetadataPolicy: "exclude" },
  );
  assert.equal(requests.length, 0);

  const cardsHash = await patchUserGameProfileCards({
    profileId: "profile-1",
    cards: state.draftCards,
    baseCardsHash: "base-cards-hash",
    accessToken: "token",
    saveFailedMessage: (status) => `HTTP ${status}`,
    invalidResponseMessage: "Invalid response",
    fetcher,
  });
  assert.equal(cardsHash, "next-cards-hash");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].input, "/api/account/game-profiles/profile-1/cards");
  assert.equal(requests[0].init.method, "PATCH");
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    baseCardsHash: "base-cards-hash",
    cards: state.draftCards,
  });
});

test("ordinary and conflict save failures do not retry or mutate the draft", async () => {
  const state = reduceGameProfileCardDraft(
    { savedCards: [], draftCards: [] },
    { type: "reset", cards: [card(1)] },
  );
  const draftCards = reduceGameProfileCardDraft(
    state,
    { type: "apply", card: card(1, { level: 50 }) },
  ).draftCards;

  for (const failure of [
    { status: 500, code: "GAME_PROFILE_CARDS_UPDATE_FAILED" },
    { status: 409, code: "GAME_PROFILE_CONFLICT" },
  ]) {
    let requestCount = 0;
    await assert.rejects(
      patchUserGameProfileCards({
        profileId: "profile-1",
        cards: draftCards,
        baseCardsHash: "base-cards-hash",
        accessToken: "token",
        saveFailedMessage: (status) => `HTTP ${status}`,
        invalidResponseMessage: "Invalid response",
        fetcher: async () => {
          requestCount += 1;
          return new Response(JSON.stringify({
            success: false,
            error: { code: failure.code, message: "Save failed" },
          }), { status: failure.status, headers: { "Content-Type": "application/json" } });
        },
      }),
      (error) => error instanceof UserGameProfileCardsPatchError && error.code === failure.code,
    );
    assert.equal(requestCount, 1);
    assert.equal(draftCards[0].level, 50);
  }
});

test("replaceGameProfileCards preserves every non-card payload section", () => {
  const payload = {
    bestdoriProfile: encodeBestdoriProfile({
      name: "Profile",
      server: 3,
      cards: [card(1)],
      items: { practice: [1, null, 3] },
      potentials: [],
    }),
    characterPotentials: { ids: "", performance: [], technique: [], visual: [] },
    source: { gameUid: "123" },
  };
  const replacement = [card(2)];
  const result = replaceGameProfileCards(payload, replacement);
  assert.deepEqual(getGameProfileCards(result), replacement);
  assert.equal(result.characterPotentials, payload.characterPotentials);
  assert.equal(result.source, payload.source);
  assert.notEqual(result.bestdoriProfile, payload.bestdoriProfile);
});

test("profile cards and team builder use one shared collection implementation", async () => {
  const [
    page,
    teamBuilderPage,
    appChrome,
    panel,
    picker,
    pickerDialog,
    pickerTile,
    cardTile,
    hoverTooltipHook,
    hoverTooltip,
    cardThumbnail,
    filterControls,
    filterState,
    profileFilterHook,
    collection,
    editor,
    temporaryEditor,
    server,
    characterHook,
    skillHook,
    localStore,
    enMessages,
    zhMessages,
  ] = await Promise.all([
    readSource("src/app/[locale]/bandori/game-profiles/[profileId]/cards/page.tsx"),
    readSource("src/app/[locale]/bandori/teambuilder/page.tsx"),
    readSource("src/components/AppChrome.tsx"),
    readSource("src/app/[locale]/bandori/teambuilder/CardPreferencesPanel.tsx"),
    readSource("src/components/bandori/card-picker/BandoriCardPicker.tsx"),
    readSource("src/components/bandori/BandoriCardPickerDialog.tsx"),
    readSource("src/components/bandori/card-picker/BandoriCardThumbnailTile.tsx"),
    readSource("src/components/bandori/BandoriCardTile.tsx"),
    readSource("src/hooks/useBandoriCardHoverTooltip.ts"),
    readSource("src/components/bandori/BandoriCardHoverTooltip.tsx"),
    readSource("src/components/bandori/BandoriCardThumbnail.tsx"),
    readSource("src/components/bandori/BandoriCardFilterControls.tsx"),
    readSource("src/lib/bandori-card-filter.ts"),
    readSource("src/hooks/useBandoriProfileCardFilter.ts"),
    readSource("src/lib/bandori-profile-card-collection.ts"),
    readSource("src/components/bandori/GameProfileCardEditorDialog.tsx"),
    readSource("src/app/[locale]/bandori/teambuilder/TemporaryCardEditorDialog.tsx"),
    readSource("src/lib/user-game-profiles-server.ts"),
    readSource("src/hooks/useBandoriCharactersMaster.ts"),
    readSource("src/hooks/useBandoriSkillsMaster.ts"),
    readSource("src/lib/user-game-profile-local-store.ts"),
    readSource("messages/en/bandori.json"),
    readSource("messages/zh-CN/bandori.json"),
  ]);

  for (const source of [page, panel]) {
    assert.match(source, /BandoriCardFilterControls/u);
    assert.match(source, /BandoriCardTile/u);
    assert.match(source, /useBandoriProfileCardEntries/u);
    assert.match(source, /useBandoriProfileCardFilter/u);
    assert.match(source, /buildBandoriCardSortValues/u);
    assert.match(source, /skillEffectLanguageTag=\{entry\.skillEffectLanguageTag\}/u);
  }
  assert.match(picker, /BandoriCardFilterControls/u);
  assert.match(filterControls, /aria-label=\{t\("rows\.sort"\)\}/u);
  assert.match(picker, /buildBandoriCardFilterOptions/u);
  assert.match(picker, /buildBandoriCardFilterOptions\(characterMetadata/u);
  assert.doesNotMatch(picker, /buildBandoriCardFilterOptions\(catalog/u);
  assert.match(profileFilterHook, /buildBandoriCardFilterOptions\(characters/u);
  assert.match(picker, /buildBandoriCardSortValues/u);
  assert.match(picker, /contextServer: server/u);
  assert.doesNotMatch(picker, /contextServer: server \?\? preferredServer/u);
  assert.match(pickerDialog, /import BandoriCardPicker from/u);
  assert.doesNotMatch(pickerDialog, /next\/dynamic/u);
  assert.doesNotMatch(pickerDialog, /forceMount/u);
  assert.match(page, /cardMetadata=\{cardMetadata\}/u);
  assert.match(pickerDialog, /cardMetadata=\{cardMetadata\}/u);
  assert.match(picker, /providedCardMetadata === undefined/u);
  assert.doesNotMatch(picker, /localStorage|PREFERENCES_STORAGE_KEY/u);
  assert.match(page, /DynamicGameProfileCardEditorDialog/u);
  assert.doesNotMatch(page, /import GameProfileCardEditorDialog from/u);
  assert.match(page, /mutedCardIds=\{draftCardIdSet\}/u);
  assert.match(page, /isCardPickerOpen && !cardEditorState/u);
  assert.match(teamBuilderPage, /isCardPickerOpen && !editingTemporaryCard/u);
  assert.match(appChrome, /useBandoriCardsAssetIndex\(\)/u);
  assert.doesNotMatch(page, /useBandoriCardsAssetIndex/u);
  assert.match(pickerDialog, /mutedCardIds=\{mutedCardIds\}/u);
  assert.match(picker, /isMuted=\{mutedCardIds\?\.has\(card\.cardId\) \?\? false\}/u);
  assert.match(pickerTile, /isMuted && BANDORI_MUTED_CARD_CLASS_NAME/u);
  assert.match(cardTile, /isMuted \? BANDORI_MUTED_CARD_CLASS_NAME/u);
  assert.match(picker, /resolveBandoriSkillLabel/u);
  assert.match(pickerTile, /detailLanguageTag=\{skillEffectLanguageTag\}/u);
  assert.match(cardTile, /detailLanguageTag=\{skillEffectLanguageTag\}/u);
  for (const tile of [pickerTile, cardTile]) {
    assert.match(tile, /useBandoriCardHoverTooltip/u);
    assert.match(tile, /onFocus=\{onFocus\}/u);
    assert.match(tile, /onBlur=\{onBlur\}/u);
  }
  assert.match(hoverTooltipHook, /event\.currentTarget\.contains\(event\.relatedTarget/u);
  assert.match(hoverTooltip, /lang=\{detailLanguageTag\}/u);
  assert.doesNotMatch(hoverTooltip, /font-family|fontFamily/u);
  assert.match(collection, /skillEffectLanguageTag: skillEffect\.languageTag/u);
  assert.equal((cardThumbnail.match(/BANDORI_MUTED_CARD_CLASS_NAME/gu) ?? []).length, 1);
  assert.match(page, /missingCardFallback="none"/u);
  assert.match(page, /replaceGameProfileCards/u);
  assert.match(server, /replaceGameProfileCards/u);
  assert.match(localStore, /updateLocalGameProfileCards[\s\S]*replaceGameProfileCards/u);
  assert.match(page, /profileLoadGenerationRef/u);
  assert.match(page, /profileLoadRequestRef/u);
  assert.match(page, /profileLoadRequestRef\.current\?\.controller\.abort\(\)/u);
  assert.match(editor, /onApply/u);
  assert.match(editor, /applyLabel: string/u);
  assert.doesNotMatch(editor, /actions\.(?:save|saving)/u);
  assert.match(editor, /applyDisabledReason/u);
  assert.doesNotMatch(editor, /role="tooltip"/u);
  assert.match(page, /draftEditor\.noChangesHint/u);
  assert.match(page, /role="alert"/u);
  assert.match(page, /LocalGameProfileNotFoundError/u);
  assert.match(localStore, /class LocalGameProfileNotFoundError extends Error/u);
  assert.match(temporaryEditor, /t\("apply"\)/u);
  assert.doesNotMatch(temporaryEditor, /t\("save"\)/u);
  assert.match(teamBuilderPage, /applyTemporaryCard/u);
  assert.doesNotMatch(teamBuilderPage, /saveTemporaryCard/u);
  assert.doesNotMatch(page, /setSaveNotice\(t\("draftMessages\.cardAlreadyOwned"\)\)/u);
  assert.doesNotMatch(page, /draftMessages\.(?:cardAddedToDraft|cardApplied|cardRemovedFromDraft)/u);
  for (const messages of [JSON.parse(enMessages), JSON.parse(zhMessages)]) {
    assert.equal("cardAddedToDraft" in messages.gameProfiles.cards.draftMessages, false);
    assert.equal("cardApplied" in messages.gameProfiles.cards.draftMessages, false);
    assert.equal("cardRemovedFromDraft" in messages.gameProfiles.cards.draftMessages, false);
  }
  assert.doesNotMatch(page, /\/api\/bandori\/characters|buildPayloadWithCards|JSON\.stringify\(draftCards/u);
  assert.doesNotMatch(page, /bandori\/teambuilder/u);
  for (const masterHook of [characterHook, skillHook]) {
    assert.match(masterHook, /@\/lib\/bandori-card-master/u);
    assert.doesNotMatch(masterHook, /@\/components\//u);
  }
  for (const source of [page, filterControls, filterState, collection, enMessages, zhMessages]) {
    assert.doesNotMatch(
      source,
      /showTrainingFilter|BandoriCardTrainingFilter|filter\.training|allTraining/u,
    );
  }
  for (const messages of [enMessages, zhMessages]) {
    assert.doesNotMatch(
      messages,
      /"workbenchTitle"|"loadCardsFailed"|"loadCharactersFailed"|"loadSkillsFailed"/u,
    );
    assert.doesNotMatch(messages, /"collectionSort"/u);
    assert.equal((messages.match(/"release_en"/gu) ?? []).length, 1);
    assert.equal((messages.match(/"release_tw"/gu) ?? []).length, 1);
  }
  for (const messages of [JSON.parse(enMessages), JSON.parse(zhMessages)]) {
    assert.deepEqual(messages.cardFilters.attributes, {
      powerful: "Powerful",
      cool: "Cool",
      happy: "Happy",
      pure: "Pure",
    });
    assert.equal(messages.teamBuilder.excludedFilter, undefined);
    assert.equal("save" in messages.cardEditor.actions, false);
    assert.equal("saving" in messages.cardEditor.actions, false);
    assert.equal("save" in messages.teamBuilder.temporaryCards, false);
  }
  const parsedEnMessages = JSON.parse(enMessages);
  const parsedZhMessages = JSON.parse(zhMessages);
  assert.equal(parsedEnMessages.cardEditor.actions.applying, "Applying...");
  assert.equal(parsedZhMessages.cardEditor.actions.applying, "应用中...");
  assert.equal(parsedEnMessages.teamBuilder.temporaryCards.apply, "Apply changes");
  assert.equal(parsedZhMessages.teamBuilder.temporaryCards.apply, "应用修改");
  assert.equal(parsedEnMessages.gameProfiles.cards.errors.localProfileNotFound, "The local profile no longer exists");
  assert.equal(parsedZhMessages.gameProfiles.cards.errors.localProfileNotFound, "本地档案已不存在");

  for (const removedPath of [
    "src/app/[locale]/bandori/teambuilder/TeamBuilderPreferenceCardTile.tsx",
    "src/app/[locale]/bandori/teambuilder/ExcludedCardFilterControls.tsx",
    "src/app/[locale]/bandori/teambuilder/useTeamBuilderPreferenceCardEntries.ts",
    "src/app/[locale]/bandori/teambuilder/TemporaryCardDialogs.tsx",
  ]) {
    await assert.rejects(readSource(removedPath), /ENOENT/u);
  }
});
