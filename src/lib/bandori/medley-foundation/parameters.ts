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
import { bestdoriCardLevelGrowthRate } from "./level-growth";

const PARAMETER_KEYS = ["performance", "technique", "visual"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberLike(value: unknown, path: string, fallback?: number): number {
  if (value === null || value === undefined || value === "") {
    if (fallback !== undefined) return fallback;
    failInput("INVALID_MASTER", path, "must be a finite number");
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    if (fallback !== undefined) return fallback;
    failInput("INVALID_MASTER", path, "must be a finite number");
  }
  return parsed;
}

function nonNegativeNumberLike(value: unknown, path: string, fallback?: number): number {
  const parsed = numberLike(value, path, fallback);
  if (parsed < 0 || Object.is(parsed, -0)) {
    failInput("INVALID_MASTER", path, "must be non-negative");
  }
  return parsed;
}

function integerLike(value: unknown, path: string, fallback?: number): number {
  const parsed = numberLike(value, path, fallback);
  if (!Number.isSafeInteger(parsed)) failInput("INVALID_MASTER", path, "must be a safe integer");
  return parsed;
}

function positiveInteger(value: unknown, path: string, maximum = 0xffff_ffff): number {
  const parsed = integerLike(value, path);
  if (parsed <= 0 || parsed > maximum) {
    failInput("INVALID_MASTER", path, `must be a positive integer no greater than ${maximum}`);
  }
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
  return PARAMETER_KEYS.map((key) => nonNegativeNumberLike(value[key], `${path}.${key}`)) as Triple<number>;
}

function add(left: Triple<number>, right: Triple<number>, path: string): Triple<number> {
  const result: Triple<number> = [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
  if (result.some((value) => !Number.isFinite(value) || value < 0)) {
    failInput("INVALID_PARAMETER", path, "derived parameters must remain finite and non-negative");
  }
  return result;
}

function sum(value: Triple<number>): number {
  const total = value[0] + value[1] + value[2];
  if (!Number.isFinite(total) || total < 0) {
    failInput("INVALID_PARAMETER", "derivedParameters", "sum must remain finite and non-negative");
  }
  return total;
}

function exactServerRegionalNumber(value: unknown, server: BandoriServer): number | null {
  if (Array.isArray(value)) {
    const selected = value[server];
    return selected !== null && selected !== undefined && selected !== "" && Number.isFinite(Number(selected))
      ? Number(selected)
      : null;
  }
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
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

/** Reconstruct one profile card from the level-one and maximum Bestdori stat rows. */
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
  if (rarity > 5) failInput("INVALID_MASTER", `${path}.rarity`, "must be an integer from 1 through 5");
  const skillId = positiveInteger(cardMaster.skillId, `${path}.skillId`);
  const stat = isRecord(cardMaster.stat)
    ? cardMaster.stat
    : failInput("INVALID_MASTER", `${path}.stat`, "must be an object");
  const training = isRecord(stat.training) ? stat.training : null;
  const baseLevelLimit = positiveInteger(cardMaster.levelLimit, `${path}.levelLimit`, 0xffff);
  const trainingLevelLimit = training === null
    ? 0
    : integerLike(training.levelLimit, `${path}.stat.training.levelLimit`);
  if (trainingLevelLimit < 0) {
    failInput("INVALID_MASTER", `${path}.stat.training.levelLimit`, "must be non-negative");
  }
  const maxLevel = baseLevelLimit + trainingLevelLimit;
  if (!Number.isSafeInteger(maxLevel) || maxLevel > 0xffff) {
    failInput("INVALID_MASTER", `${path}.levelLimit`, "combined level limit is invalid");
  }
  if (!Number.isSafeInteger(state.level) || state.level < 1 || state.level > maxLevel) {
    failInput("INVALID_CARD", `${path}.profile.level`, `must be between 1 and ${maxLevel}`);
  }
  if (!Number.isSafeInteger(state.masterRank) || state.masterRank < 0 || state.masterRank > 4) {
    failInput("INVALID_CARD", `${path}.profile.masterRank`, "must be an integer from 0 through 4");
  }
  if (state.isTrained && training === null) {
    failInput("INVALID_MASTER", `${path}.stat.training`, "is required by the trained profile state");
  }

  const minimumParameter = readParameterVector(stat["1"], `${path}.stat.1`);
  const maximumParameter = readParameterVector(stat[String(maxLevel)], `${path}.stat.${maxLevel}`);
  const growthRate = state.level === maxLevel
    ? 1
    : bestdoriCardLevelGrowthRate(rarity, state.level);
  if (growthRate === null) {
    failInput("INVALID_CARD", `${path}.profile.level`, "has no Bestdori growth ratio for this rarity");
  }
  let baseParameter = minimumParameter.map((minimum, index) => (
    Math.round(minimum + (maximumParameter[index] - minimum) * growthRate)
  )) as Triple<number>;
  const masterRankBonus = 50 * rarity * state.masterRank;
  baseParameter = add(
    baseParameter,
    [masterRankBonus, masterRankBonus, masterRankBonus],
    `${path}.profile.masterRank`,
  );
  if (state.isTrained && training !== null) {
    baseParameter = add(
      baseParameter,
      readParameterVector(training, `${path}.stat.training`),
      `${path}.stat.training`,
    );
  }
  const episodes = Array.isArray(stat.episodes) ? stat.episodes : [];
  if (!Number.isSafeInteger(state.episodeCount) || state.episodeCount < 0 || state.episodeCount > episodes.length) {
    failInput("INVALID_CARD", `${path}.profile.episodeCount`, `must be between 0 and ${episodes.length}`);
  }
  for (let index = 0; index < state.episodeCount; index += 1) {
    baseParameter = add(
      baseParameter,
      readParameterVector(episodes[index], `${path}.stat.episodes[${index}]`),
      `${path}.stat.episodes[${index}]`,
    );
  }

  const bonus = bonusForCharacter(characterId, characterBonuses);
  const characterBonus = baseParameter.map((parameter, index) => {
    const potentialLevel = bonus.potential[index] ?? 0;
    if (
      !Number.isFinite(potentialLevel)
      || potentialLevel < 0
      || !Number.isFinite(bonus.collection[index])
      || bonus.collection[index] < 0
      || !Number.isFinite(bonus.training[index])
      || bonus.training[index] < 0
    ) {
      failInput("INVALID_PROFILE", `${path}.profile.characterBonuses`, "must be finite and non-negative");
    }
    const potentialRate = potentialLevel > 1 ? potentialLevel / 1000 : 0;
    return Math.floor(parameter * potentialRate)
      + Math.floor(parameter * bonus.collection[index] / 100)
      + Math.floor(parameter * bonus.training[index] / 100);
  }) as Triple<number>;
  const characterParameter = add(baseParameter, characterBonus, `${path}.profile.characterBonuses`);
  const characterMaster = isRecord(characterMasterValue)
    ? characterMasterValue
    : failInput("INVALID_MASTER", `${path}.character`, "character master is missing");
  const bandId = positiveInteger(characterMaster.bandId, `${path}.character.bandId`);

  return {
    ...state,
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
    if (rates.some((rate) => !Number.isFinite(rate) || rate < 0)) {
      failInput("INVALID_MASTER", `areaItemsById.${areaItemId}`, "rates must be finite and non-negative");
    }
    return total + cards.reduce((itemPower, card) => {
      if (!targetAttributes.includes(card.attribute) || !targetBands.includes(card.bandId)) {
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
  path: string,
  predicate: (record: Record<string, unknown>) => boolean,
): number {
  if (values === undefined || values === null) return 0;
  if (!Array.isArray(values)) failInput("INVALID_PARAMETER", path, "must be an array");
  for (let index = 0; index < values.length; index += 1) {
    const record = values[index];
    if (!isRecord(record)) failInput("INVALID_PARAMETER", `${path}[${index}]`, "must be an object");
    if (predicate(record)) return eventNumber(record.percent, `${path}[${index}].percent`) / 100;
  }
  return 0;
}

function eventNumber(value: unknown, path: string, fallback?: number): number {
  if (value === null || value === undefined || value === "") {
    if (fallback !== undefined) return fallback;
    failInput("INVALID_PARAMETER", path, "must be a finite non-negative number");
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || Object.is(parsed, -0)) {
    failInput("INVALID_PARAMETER", path, "must be a finite non-negative number");
  }
  return parsed;
}

function eventInteger(value: unknown, path: string, allowZero = false): number {
  const parsed = eventNumber(value, path);
  if (!Number.isSafeInteger(parsed) || (allowZero ? parsed < 0 : parsed <= 0) || parsed > 0xffff_ffff) {
    failInput("INVALID_PARAMETER", path, allowZero
      ? "must be an unsigned 32-bit integer"
      : "must be a positive unsigned 32-bit integer");
  }
  return parsed;
}

function eventParameterVector(card: CalculatedProfileCardV1, eventBonus: unknown): Triple<number> {
  if (eventBonus === null) return [0, 0, 0];
  if (!isRecord(eventBonus)) failInput("INVALID_PARAMETER", "eventBonus", "must be an object or null");
  const attributePercent = matchingPercent(
    eventBonus.attributes,
    "eventBonus.attributes",
    (record) => record.attribute === card.attribute,
  );
  const characterPercent = matchingPercent(
    eventBonus.characters,
    "eventBonus.characters",
    (record) => eventInteger(record.characterId, "eventBonus.characters.characterId") === card.characterId,
  );
  const memberPercent = matchingPercent(eventBonus.members, "eventBonus.members", (record) => {
    const situationId = eventInteger(record.situationId, "eventBonus.members.situationId");
    return situationId === card.cardId;
  });
  const masterRankPercent = matchingPercent(eventBonus.limitBreaks, "eventBonus.limitBreaks", (record) => (
    eventInteger(record.rarity, "eventBonus.limitBreaks.rarity") === card.rarity
    && eventInteger(record.rank, "eventBonus.limitBreaks.rank", true) === card.masterRank
  ));
  const matchesAttributeAndCharacter = attributePercent > 0 && characterPercent > 0;
  const parameterPercent = matchesAttributeAndCharacter
    ? eventNumber(eventBonus.parameterPercent, "eventBonus.parameterPercent", 0) / 100
    : 0;
  const baseRate = attributePercent + characterPercent + memberPercent + masterRankPercent + parameterPercent;
  const roomRates = matchesAttributeAndCharacter
    ? PARAMETER_KEYS.map((key) => eventNumber(
      eventBonus[`${key}Percent`],
      `eventBonus.${key}Percent`,
      0,
    ) / 100) as Triple<number>
    : [0, 0, 0] as Triple<number>;
  const result = card.characterParameter.map((parameter, index) => (
    parameter * (baseRate + roomRates[index])
  )) as Triple<number>;
  if (result.some((value) => !Number.isFinite(value) || value < 0)) {
    failInput("INVALID_PARAMETER", "eventBonus", "derived parameters must remain finite and non-negative");
  }
  return result;
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
  const eventPower = options.cards.reduce((total, card) => (
    total + sum(eventParameterVector(card, options.eventBonus))
  ), 0);
  const deckTotalParameter = cardPower + areaItemPower + eventPower;
  if (![cardPower, areaItemPower, eventPower, deckTotalParameter].every((value) => (
    Number.isFinite(value) && value >= 0
  ))) {
    failInput("INVALID_PARAMETER", "teamParameters", "derived totals must remain finite and non-negative");
  }
  return {
    cardPower,
    areaItemPower,
    eventPower,
    deckTotalParameter,
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
