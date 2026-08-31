import { BANDORI_AREA_ITEM_IDS_BY_GROUP } from "@/lib/bandori-area-item-groups";

import {
  MEDLEY_SCORING_RULES_VERSION,
  MEDLEY_SEARCH_INPUT_SCHEMA_VERSION,
  MEDLEY_SEARCH_SOURCE_SCHEMA_VERSION,
} from "./contracts";
import type {
  AreaItemConfigurationV1,
  BandoriCardAttribute,
  CalculatedProfileCardV1,
  MedleySearchInputV1,
  SearchCardSkillContextsV1,
} from "./contracts";
import { assertAllowedKeys, failInput, readRecord } from "./errors";
import { parsePerfectRatePercent } from "./numeric";
import {
  calculateCardEventParameter,
  calculateProfileAreaItem,
  calculateProfileCard,
} from "./parameters";
import { decodeMedleyProfile } from "./profile";
import { resolveBestdoriScoreSkill } from "./skills";
import {
  buildSongs,
  readSongSelections,
  requireSourceMaster,
  resolveSourceCardMaster,
} from "./source-masters";

const BAND_AREA_ITEM_GROUP_KEYS = [
  "PoppinParty",
  "Afterglow",
  "HelloHappyWorld",
  "PastelPalettes",
  "Roselia",
  "Morfonica",
  "RaiseASuilen",
  "MyGO",
  "Everyone",
] as const;

const ATTRIBUTE_AREA_ITEM_IDS: Record<BandoriCardAttribute, readonly number[]> = {
  powerful: [70, 56],
  cool: [66, 57],
  happy: [67, 58],
  pure: [69, 60],
};

const PARAMETER_AREA_ITEM_IDS = [[80], [81], [82]] as const;

function resolveSkillContexts(
  card: CalculatedProfileCardV1,
  skillMaster: Record<string, unknown>,
  server: 0 | 1 | 2 | 3,
  path: string,
): SearchCardSkillContextsV1 {
  const resolve = (sameBandId: number | null, sameAttribute: BandoriCardAttribute | null) => (
    resolveBestdoriScoreSkill({
      skillId: card.skillId,
      skillLevel: card.skillLevel,
      skillMaster,
      context: { sameBandId, sameAttribute },
      server,
      path,
    })
  );
  return {
    mixed: resolve(null, null),
    sameBand: resolve(card.bandId, null),
    sameAttribute: resolve(null, card.attribute),
    sameBandAndAttribute: resolve(card.bandId, card.attribute),
  };
}

function ownedIdsInOrder(owned: ReadonlySet<number>, ids: readonly number[]): number[] {
  return ids.filter((areaItemId) => owned.has(areaItemId));
}

function buildAreaConfigurations(ownedAreaItemIds: ReadonlySet<number>): AreaItemConfigurationV1[] {
  const bandChoices = BAND_AREA_ITEM_GROUP_KEYS
    .map((key) => ownedIdsInOrder(ownedAreaItemIds, BANDORI_AREA_ITEM_IDS_BY_GROUP[key] ?? []))
    .filter((ids) => ids.length > 0);
  const attributeChoices = Object.values(ATTRIBUTE_AREA_ITEM_IDS)
    .map((ids) => ownedIdsInOrder(ownedAreaItemIds, ids))
    .filter((ids) => ids.length > 0);
  const parameterChoices = PARAMETER_AREA_ITEM_IDS
    .map((ids) => ownedIdsInOrder(ownedAreaItemIds, ids))
    .filter((ids) => ids.length > 0);
  const unique = new Map<string, AreaItemConfigurationV1>();

  for (const bandIds of bandChoices.length > 0 ? bandChoices : [[]]) {
    for (const attributeIds of attributeChoices.length > 0 ? attributeChoices : [[]]) {
      for (const parameterIds of parameterChoices.length > 0 ? parameterChoices : [[]]) {
        const selectedAreaItemIds = [...bandIds, ...attributeIds, ...parameterIds];
        const key = [...selectedAreaItemIds].sort((left, right) => left - right).join(",");
        if (!unique.has(key)) unique.set(key, { selectedAreaItemIds });
      }
    }
  }
  return [...unique.values()];
}

/** Build the normalized Rust search request from the current HHWX profile payload and raw masters. */
export function buildMedleySearchInput(
  value: unknown,
  path = "sourceInput",
): MedleySearchInputV1 {
  const source = readRecord(value, path, "INVALID_PARAMETER");
  assertAllowedKeys(
    source,
    [
      "schemaVersion",
      "profilePayload",
      "cardsById",
      "charactersById",
      "skillsById",
      "areaItemsById",
      "songsById",
      "eventBonus",
      "perfectRatePercentText",
      "songs",
    ],
    [
      "schemaVersion",
      "profilePayload",
      "cardsById",
      "charactersById",
      "skillsById",
      "areaItemsById",
      "songsById",
      "eventBonus",
      "perfectRatePercentText",
      "songs",
    ],
    path,
    "INVALID_PARAMETER",
  );
  if (source.schemaVersion !== MEDLEY_SEARCH_SOURCE_SCHEMA_VERSION) {
    failInput("UNSUPPORTED_SCHEMA", `${path}.schemaVersion`, "unsupported medley-search source schema");
  }

  const profile = decodeMedleyProfile(source.profilePayload, `${path}.profilePayload`);
  const cardsById = readRecord(source.cardsById, `${path}.cardsById`, "INVALID_MASTER");
  const charactersById = readRecord(source.charactersById, `${path}.charactersById`, "INVALID_MASTER");
  const skillsById = readRecord(source.skillsById, `${path}.skillsById`, "INVALID_MASTER");
  const areaItemsById = readRecord(source.areaItemsById, `${path}.areaItemsById`, "INVALID_MASTER");
  const songsById = readRecord(source.songsById, `${path}.songsById`, "INVALID_MASTER");
  const characterBonuses = new Map(
    profile.characterBonuses.map((bonus) => [bonus.characterId, bonus]),
  );

  const cards = profile.cards.map((state, instanceId) => {
    const cardPath = `${path}.cardsById.${state.cardId}`;
    const cardMaster = resolveSourceCardMaster(
      requireSourceMaster(cardsById, state.cardId, `${path}.cardsById`),
      profile.server,
      cardPath,
    );
    const provisionalCharacterId = Number(cardMaster.characterId);
    if (!Number.isSafeInteger(provisionalCharacterId) || provisionalCharacterId <= 0) {
      failInput("INVALID_MASTER", `${cardPath}.characterId`, "must be a positive integer");
    }
    const card = calculateProfileCard(
      state,
      cardMaster,
      requireSourceMaster(charactersById, provisionalCharacterId, `${path}.charactersById`),
      characterBonuses,
      cardPath,
    );
    const skillPath = `${path}.skillsById.${card.skillId}`;
    const skillMaster = requireSourceMaster(skillsById, card.skillId, `${path}.skillsById`);
    return {
      instanceId,
      masterCardId: card.cardId,
      characterId: card.characterId,
      bandId: card.bandId,
      attribute: card.attribute,
      isExcluded: card.isExcluded,
      characterParameter: card.characterParameter,
      eventParameter: calculateCardEventParameter(card, source.eventBonus),
      skillContexts: resolveSkillContexts(card, skillMaster, profile.server, skillPath),
    };
  });

  const areaItems = profile.areaItems.map((state) => calculateProfileAreaItem(
    state,
    requireSourceMaster(areaItemsById, state.areaItemId, `${path}.areaItemsById`),
    profile.server,
    `${path}.areaItemsById.${state.areaItemId}`,
  ));
  const ownedAreaItemIds = new Set(areaItems.map((item) => item.areaItemId));
  const songSelections = readSongSelections(source.songs, `${path}.songs`);

  return {
    schemaVersion: MEDLEY_SEARCH_INPUT_SCHEMA_VERSION,
    scoringRulesVersion: MEDLEY_SCORING_RULES_VERSION,
    perfectRate: parsePerfectRatePercent(
      source.perfectRatePercentText,
      `${path}.perfectRatePercentText`,
    ),
    cards,
    areaItems,
    areaConfigurations: buildAreaConfigurations(ownedAreaItemIds),
    songs: buildSongs(songSelections, songsById, `${path}.songs`),
  };
}
