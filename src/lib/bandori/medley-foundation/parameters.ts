import type {
  BandoriCardAttribute,
  BandoriServer,
  CalculatedProfileCardV1,
  DecodedAreaItemStateV1,
  DecodedCharacterBonusV1,
  DecodedProfileCardV1,
  FixedTeamParameterTraceV1,
  Five,
  Triple,
} from "./contracts";
import { failInput } from "./errors";

const PARAMETER_KEYS = ["performance", "technique", "visual"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberLike(value: unknown, path: string, fallback?: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    if (fallback !== undefined) return fallback;
    failInput("INVALID_MASTER", path, "must be a finite number");
  }
  return parsed;
}

function integerLike(value: unknown, path: string, fallback?: number): number {
  const parsed = numberLike(value, path, fallback);
  if (!Number.isSafeInteger(parsed)) failInput("INVALID_MASTER", path, "must be a safe integer");
  return parsed;
}

function positiveInteger(value: unknown, path: string): number {
  const parsed = integerLike(value, path);
  if (parsed <= 0) failInput("INVALID_MASTER", path, "must be positive");
  return parsed;
}

function readAttribute(value: unknown, path: string): BandoriCardAttribute {
  if (value === "powerful" || value === "cool" || value === "happy" || value === "pure") {
    return value;
  }
  failInput("INVALID_MASTER", path, "must be a Bestdori card attribute");
}

function readParameterVector(value: unknown, path: string): Triple<number> {
  if (!isRecord(value)) failInput("INVALID_MASTER", path, "must be a parameter object");
  return PARAMETER_KEYS.map((key) => numberLike(value[key], `${path}.${key}`, 0)) as Triple<number>;
}

function add(left: Triple<number>, right: Triple<number>): Triple<number> {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function sum(value: Triple<number>): number {
  return value[0] + value[1] + value[2];
}

function regionalNumber(value: unknown, server: BandoriServer): number | null {
  if (Array.isArray(value)) {
    const selected = value[server];
    if (selected !== null && selected !== undefined && Number.isFinite(Number(selected))) {
      return Number(selected);
    }
    const jp = value[0];
    return jp !== null && jp !== undefined && Number.isFinite(Number(jp)) ? Number(jp) : null;
  }
  return value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
}

function exactServerRegionalNumber(value: unknown, server: BandoriServer): number | null {
  if (Array.isArray(value)) {
    const selected = value[server];
    return selected !== null && selected !== undefined && Number.isFinite(Number(selected))
      ? Number(selected)
      : null;
  }
  return value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
}

function regionalLevelNumber(
  levels: unknown,
  level: number,
  server: BandoriServer,
): number {
  if (!isRecord(levels)) return 0;
  for (let current = Math.trunc(level); current > 0; current -= 1) {
    const resolved = exactServerRegionalNumber(levels[String(current)], server);
    if (resolved !== null) return resolved;
  }
  return 0;
}

function bonusForCharacter(
  characterId: number,
  characterBonuses: ReadonlyMap<number, DecodedCharacterBonusV1>,
): DecodedCharacterBonusV1 {
  return characterBonuses.get(characterId) ?? {
    characterId,
    potential: [null, null, null],
    collection: [0, 0, 0],
    training: [0, 0, 0],
  };
}

/** Calculate one profile card from its exact selected-level Bestdori master row. */
export function calculateProfileCard(
  state: DecodedProfileCardV1,
  cardMasterValue: unknown,
  characterMasterValue: unknown,
  characterBonuses: ReadonlyMap<number, DecodedCharacterBonusV1>,
  path = `cardsById.${state.cardId}`,
): CalculatedProfileCardV1 {
  const cardMaster = isRecord(cardMasterValue)
    ? cardMasterValue
    : failInput("INVALID_MASTER", path, "card master is missing");
  const characterId = positiveInteger(cardMaster.characterId, `${path}.characterId`);
  const attribute = readAttribute(cardMaster.attribute, `${path}.attribute`);
  const rarity = positiveInteger(cardMaster.rarity, `${path}.rarity`);
  const skillId = positiveInteger(cardMaster.skillId, `${path}.skillId`);
  const stat = isRecord(cardMaster.stat)
    ? cardMaster.stat
    : failInput("INVALID_MASTER", `${path}.stat`, "must be an object");
  const training = isRecord(stat.training) ? stat.training : null;
  const baseLevelLimit = Math.max(1, integerLike(cardMaster.levelLimit, `${path}.levelLimit`, 1));
  const trainingLevelLimit = Math.max(
    0,
    integerLike(training?.levelLimit, `${path}.stat.training.levelLimit`, 0),
  );
  const maxLevel = baseLevelLimit + trainingLevelLimit;
  const level = Math.min(maxLevel, Math.max(1, state.level));
  const levelStat = stat[String(level)];
  if (!isRecord(levelStat)) {
    failInput(
      "INVALID_MASTER",
      `${path}.stat.${level}`,
      "the fixed foundation requires an exact selected-level card stat row",
    );
  }
  let baseParameter = readParameterVector(levelStat, `${path}.stat.${level}`);
  const masterRankBonus = 50 * rarity * Math.max(0, state.masterRank);
  baseParameter = add(baseParameter, [masterRankBonus, masterRankBonus, masterRankBonus]);
  if (state.isTrained && training) {
    baseParameter = add(baseParameter, readParameterVector(training, `${path}.stat.training`));
  }
  const episodes = Array.isArray(stat.episodes) ? stat.episodes : [];
  for (let index = 0; index < Math.min(episodes.length, Math.max(0, state.episodeCount)); index += 1) {
    baseParameter = add(baseParameter, readParameterVector(episodes[index], `${path}.stat.episodes[${index}]`));
  }

  const bonus = bonusForCharacter(characterId, characterBonuses);
  const characterBonus = baseParameter.map((parameter, index) => {
    const potentialLevel = bonus.potential[index] ?? 0;
    const potentialRate = potentialLevel > 1 ? potentialLevel / 1000 : 0;
    return Math.floor(parameter * potentialRate)
      + Math.floor(parameter * bonus.collection[index] / 100)
      + Math.floor(parameter * bonus.training[index] / 100);
  }) as Triple<number>;
  const characterParameter = add(baseParameter, characterBonus);
  const characterMaster = isRecord(characterMasterValue) ? characterMasterValue : null;
  const bandValue = characterMaster ? numberLike(characterMaster.bandId, `${path}.character.bandId`, Number.NaN) : Number.NaN;
  const bandId = Number.isFinite(bandValue) ? bandValue : null;

  return {
    ...state,
    level,
    characterId,
    bandId,
    attribute,
    rarity,
    skillId,
    baseParameter,
    characterParameter,
    totalPower: sum(characterParameter),
  };
}

function selectedAreaItemPower(
  cards: readonly CalculatedProfileCardV1[],
  areaItemsById: Record<string, unknown>,
  profileAreaItems: ReadonlyMap<number, DecodedAreaItemStateV1>,
  selectedAreaItemIds: readonly number[],
  server: BandoriServer,
): number {
  return selectedAreaItemIds.reduce((total, areaItemId) => {
    const state = profileAreaItems.get(areaItemId);
    const master = areaItemsById[String(areaItemId)];
    if (!state || !isRecord(master) || state.level <= 0) return total;
    const targetAttributes = Array.isArray(master.targetAttributes) ? master.targetAttributes : [];
    const targetBands = Array.isArray(master.targetBandIds)
      ? master.targetBandIds.map((value) => Math.trunc(numberLike(value, `areaItemsById.${areaItemId}.targetBandIds`, 0)))
      : [];
    const rates = PARAMETER_KEYS.map((key) => (
      regionalLevelNumber(master[key], state.level, server) / 100
    )) as Triple<number>;
    return total + cards.reduce((itemPower, card) => {
      if (!targetAttributes.includes(card.attribute) || card.bandId === null || !targetBands.includes(card.bandId)) {
        return itemPower;
      }
      return itemPower
        + card.characterParameter[0] * rates[0]
        + card.characterParameter[1] * rates[1]
        + card.characterParameter[2] * rates[2];
    }, 0);
  }, 0);
}

function matchingPercent(
  values: unknown,
  predicate: (record: Record<string, unknown>) => boolean,
): number {
  if (!Array.isArray(values)) return 0;
  const match = values.find((value) => isRecord(value) && predicate(value));
  return isRecord(match) ? numberLike(match.percent, "eventBonus.percent", 0) / 100 : 0;
}

function eventParameterVector(card: CalculatedProfileCardV1, eventBonus: unknown): Triple<number> {
  if (!isRecord(eventBonus)) return [0, 0, 0];
  const attributePercent = matchingPercent(eventBonus.attributes, (record) => record.attribute === card.attribute);
  const characterPercent = matchingPercent(
    eventBonus.characters,
    (record) => Math.trunc(numberLike(record.characterId, "eventBonus.characters.characterId", 0)) === card.characterId,
  );
  const memberPercent = matchingPercent(eventBonus.members, (record) => {
    const situationId = Math.trunc(numberLike(record.situationId, "eventBonus.members.situationId", 0));
    const id = Math.trunc(numberLike(record.id, "eventBonus.members.id", 0));
    return situationId === card.cardId || id === card.cardId;
  });
  const masterRankPercent = matchingPercent(eventBonus.limitBreaks, (record) => (
    Math.trunc(numberLike(record.rarity, "eventBonus.limitBreaks.rarity", 0)) === card.rarity
    && Math.trunc(numberLike(record.rank, "eventBonus.limitBreaks.rank", 0)) === card.masterRank
  ));
  const matchesAttributeAndCharacter = attributePercent > 0 && characterPercent > 0;
  const parameterPercent = matchesAttributeAndCharacter
    ? numberLike(eventBonus.parameterPercent, "eventBonus.parameterPercent", 0) / 100
    : 0;
  const baseRate = attributePercent + characterPercent + memberPercent + masterRankPercent + parameterPercent;
  const roomRates = matchesAttributeAndCharacter
    ? PARAMETER_KEYS.map((key) => numberLike(eventBonus[`${key}Percent`], `eventBonus.${key}Percent`, 0) / 100) as Triple<number>
    : [0, 0, 0] as Triple<number>;
  return card.characterParameter.map((parameter, index) => (
    parameter * (baseRate + roomRates[index])
  )) as Triple<number>;
}

/** Derive Bestdori-compatible card, selected area-item, and event parameters for one fixed team. */
export function calculateFixedTeamParameters(options: {
  cards: Five<CalculatedProfileCardV1>;
  areaItemsById: Record<string, unknown>;
  profileAreaItems: ReadonlyMap<number, DecodedAreaItemStateV1>;
  selectedAreaItemIds: readonly number[];
  eventBonus: unknown;
  server: BandoriServer;
}): FixedTeamParameterTraceV1 {
  const selectedIds = [...options.selectedAreaItemIds];
  if (new Set(selectedIds).size !== selectedIds.length || selectedIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    failInput("INVALID_PARAMETER", "selectedAreaItemIds", "must contain unique positive integers");
  }
  const cardPower = options.cards.reduce((total, card) => total + card.totalPower, 0);
  const areaItemPower = selectedAreaItemPower(
    options.cards,
    options.areaItemsById,
    options.profileAreaItems,
    selectedIds,
    options.server,
  );
  const eventPower = Math.floor(options.cards.reduce((total, card) => (
    total + sum(eventParameterVector(card, options.eventBonus))
  ), 0));
  return {
    cardPower,
    areaItemPower,
    eventPower,
    deckTotalParameter: cardPower + areaItemPower + eventPower,
    selectedAreaItemIds: selectedIds,
    cards: options.cards.map((card) => ({
      cardId: card.cardId,
      baseParameter: card.baseParameter,
      characterParameter: card.characterParameter,
    })) as Five<{
      cardId: number;
      baseParameter: Triple<number>;
      characterParameter: Triple<number>;
    }>,
  };
}

export { regionalNumber };
