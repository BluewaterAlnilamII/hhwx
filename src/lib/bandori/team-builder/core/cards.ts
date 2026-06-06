/*
 * Candidate-card and area-item preparation shared by single-song and medley search.
 *
 * This module turns raw profile cards into search cards with stable power, event, support,
 * and skill-rate fields. Search-mode heuristics such as compression live in single/search-prep.
 */
import { BANDORI_AREA_ITEM_IDS_BY_GROUP } from "@/lib/bandori-area-item-groups";
import {
  calculateBandoriCard,
  calculateBandoriCardEventBonus,
  calculateBandoriRoundedParamBonusPower,
  calculateBandoriSupportCardEventBonus,
  resolveBandoriSkill,
  type BandoriCardAttribute,
  type BandoriTeamContext,
  type BandoriUserAreaItemState,
  type BestdoriAreaItemMaster,
  type BestdoriSkillMaster,
  type CalculatedBandoriCard,
} from "@/lib/bandori-team-calculator";
import { ATTRIBUTE_AREA_ITEM_IDS, BAND_AREA_ITEM_GROUP_KEYS, PARAMETER_AREA_ITEM_IDS, PARAMETER_KEYS } from "./constants";
import { calculateResolvedSkillUpperRatesPerPower, calculateSkillUpperRatesPerPower, getSkillDurationSeconds } from "./scoring";
import { clamp, getRegionalNumber, toFiniteNumber } from "./utils";
import { normalizeSearchEventType, normalizeSearchTarget, resolveBandoriTeamSearchEventMode, resolveBandoriTeamSearchUseFever } from "./events";
import { compareCardInstanceKey, getCardInstanceKey, getCardInstanceKeys } from "./card-identity";
import type { BandoriAreaItemConfiguration, BandoriTeamSearchEventMode, BandoriTeamSearchInput, BandoriTeamSearchTarget, CharacterUpperBoundIndex, PreparedChart, ScoreComboOptions, SearchCard, SearchCardSkillRateProfile, SearchCardGroup, SearchObjectiveAdapter, SearchPrecomputedData, SupportBandCandidate, SupportBandContext, SupportBandSelection } from "./types";

const SKILL_RATE_PROFILE_CACHE_LIMIT = 20000;
const skillRateProfileCache = new Map<string, SearchCardSkillRateProfile>();
export function toAreaItemStateMap(areaItems: BandoriUserAreaItemState[]): Record<string, BandoriUserAreaItemState | undefined> {
  return Object.fromEntries(areaItems.map((item) => [String(item.areaItemId), item]));
}

function isOwnedAreaItem(userAreaItemsById: Record<string, BandoriUserAreaItemState | undefined>, areaItemId: number): boolean {
  return (userAreaItemsById[String(areaItemId)]?.level ?? 0) > 0;
}

export function createAreaItemConfigurations(userAreaItems: BandoriUserAreaItemState[]): BandoriAreaItemConfiguration[] {
  // Bestdori area-item slots behave like band + attribute + parameter-item combinations.
  // Keep an empty choice when the user owns none in a category so search can fall back to no-item configurations.
  const userAreaItemsById = toAreaItemStateMap(userAreaItems);
  const bandConfigs = BAND_AREA_ITEM_GROUP_KEYS
    .map((bandKey) => ({
      bandKey,
      selectedAreaItemIds: (BANDORI_AREA_ITEM_IDS_BY_GROUP[bandKey] ?? []).filter((areaItemId) => isOwnedAreaItem(userAreaItemsById, areaItemId)),
    }))
    .filter((config) => config.selectedAreaItemIds.length > 0);
  const attributeConfigs = (Object.entries(ATTRIBUTE_AREA_ITEM_IDS) as Array<[BandoriCardAttribute, number[]]>)
    .map(([attribute, areaItemIds]) => ({
      attribute,
      selectedAreaItemIds: areaItemIds.filter((areaItemId) => isOwnedAreaItem(userAreaItemsById, areaItemId)),
    }))
    .filter((config) => config.selectedAreaItemIds.length > 0);
  const parameterConfigs = (Object.entries(PARAMETER_AREA_ITEM_IDS) as Array<[keyof typeof PARAMETER_AREA_ITEM_IDS, readonly number[]]>)
    .map(([parameter, areaItemIds]) => ({
      parameter,
      selectedAreaItemIds: areaItemIds.filter((areaItemId) => isOwnedAreaItem(userAreaItemsById, areaItemId)),
    }))
    .filter((config) => config.selectedAreaItemIds.length > 0);
  const uniqueConfigs = new Map<string, BandoriAreaItemConfiguration>();

  for (const bandConfig of bandConfigs.length > 0 ? bandConfigs : [{ bandKey: null, selectedAreaItemIds: [] }]) {
    for (const attributeConfig of attributeConfigs.length > 0 ? attributeConfigs : [{ attribute: null, selectedAreaItemIds: [] }]) {
      for (const parameterConfig of [{ parameter: null, selectedAreaItemIds: [] }, ...parameterConfigs]) {
        const selectedAreaItemIds = [
          ...bandConfig.selectedAreaItemIds,
          ...attributeConfig.selectedAreaItemIds,
          ...parameterConfig.selectedAreaItemIds,
        ];
        const key = selectedAreaItemIds.slice().sort((left, right) => left - right).join(",");
        if (!uniqueConfigs.has(key)) {
          uniqueConfigs.set(key, {
            bandKey: bandConfig.bandKey,
            attribute: attributeConfig.attribute,
            parameter: parameterConfig.parameter,
            selectedAreaItemIds,
          });
        }
      }
    }
  }

  return [...uniqueConfigs.values()];
}

export function getAreaItemConfigurationKey(configuration: BandoriAreaItemConfiguration): string {
  return configuration.selectedAreaItemIds.slice().sort((left, right) => left - right).join(",");
}

function buildSearchCardSkillRateProfile(
  card: CalculatedBandoriCard,
  input: BandoriTeamSearchInput,
  chart: PreparedChart,
  server: number,
  comboOptions?: ScoreComboOptions,
): SearchCardSkillRateProfile {
  // Conditional skills can be resolved accurately only with the full team context.
  // Precompute possible context bounds so DFS partitions can prune safely and tightly.
  const skillUpperRates = calculateSkillUpperRatesPerPower(
    chart,
    input.skillsById[String(card.skillId)],
    card.skillLevel,
    server,
    comboOptions,
  );
  const mixedContext: BandoriTeamContext = {
    sameBandId: null,
    sameAttribute: null,
  };
  const skill = input.skillsById[String(card.skillId)];
  const sameBandContext: BandoriTeamContext = {
    sameBandId: card.bandId,
    sameAttribute: null,
  };
  const sameAttributeContext: BandoriTeamContext = {
    sameBandId: null,
    sameAttribute: card.attribute,
  };
  const bothContext: BandoriTeamContext = {
    sameBandId: card.bandId,
    sameAttribute: card.attribute,
  };
  const sameBandSkillUpperRates = calculateResolvedSkillUpperRatesPerPower(
    chart,
    skill ? resolveBandoriSkill(card.skillId, skill, card.skillLevel, sameBandContext, server) : null,
    comboOptions,
  );
  const sameAttributeSkillUpperRates = calculateResolvedSkillUpperRatesPerPower(
    chart,
    skill ? resolveBandoriSkill(card.skillId, skill, card.skillLevel, sameAttributeContext, server) : null,
    comboOptions,
  );
  const bothSkillUpperRates = calculateResolvedSkillUpperRatesPerPower(
    chart,
    skill ? resolveBandoriSkill(card.skillId, skill, card.skillLevel, bothContext, server) : null,
    comboOptions,
  );
  const mixedSkillUpperRates = calculateResolvedSkillUpperRatesPerPower(
    chart,
    skill ? resolveBandoriSkill(card.skillId, skill, card.skillLevel, mixedContext, server) : null,
    comboOptions,
  );

  return {
    skillUpperRate: skillUpperRates.maxRate,
    skillAverageRate: skillUpperRates.averageRate,
    skillLeaderRate: skillUpperRates.leaderRate,
    skillSameBandAverageRate: sameBandSkillUpperRates.averageRate,
    skillSameBandLeaderRate: sameBandSkillUpperRates.leaderRate,
    skillSameAttributeAverageRate: sameAttributeSkillUpperRates.averageRate,
    skillSameAttributeLeaderRate: sameAttributeSkillUpperRates.leaderRate,
    skillBothAverageRate: bothSkillUpperRates.averageRate,
    skillBothLeaderRate: bothSkillUpperRates.leaderRate,
    skillMixedAverageRate: mixedSkillUpperRates.averageRate,
    skillMixedLeaderRate: mixedSkillUpperRates.leaderRate,
  };
}

function getSkillRateProfileCacheKey(
  card: CalculatedBandoriCard,
  input: BandoriTeamSearchInput,
  server: number,
  comboOptions?: ScoreComboOptions,
): string | null {
  if (!input.chartCacheKey) {
    return null;
  }

  return [
    input.chartCacheKey,
    resolveBandoriTeamSearchUseFever(input) ? "fever" : "no-fever",
    server,
    comboOptions?.startCombo ?? 0,
    comboOptions?.useMedleyCombo ? 1 : 0,
    card.skillId,
    card.skillLevel,
    card.bandId ?? "none",
    card.attribute,
  ].join(":");
}

export function getCachedSearchCardSkillRateProfile(
  card: CalculatedBandoriCard,
  input: BandoriTeamSearchInput,
  chart: PreparedChart,
  server: number,
  comboOptions?: ScoreComboOptions,
): SearchCardSkillRateProfile {
  const cacheKey = getSkillRateProfileCacheKey(card, input, server, comboOptions);
  if (cacheKey) {
    const cached = skillRateProfileCache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const profile = buildSearchCardSkillRateProfile(card, input, chart, server, comboOptions);
  if (cacheKey) {
    skillRateProfileCache.set(cacheKey, profile);
    if (skillRateProfileCache.size > SKILL_RATE_PROFILE_CACHE_LIMIT) {
      const oldestKey = skillRateProfileCache.keys().next().value;
      if (oldestKey) {
        skillRateProfileCache.delete(oldestKey);
      }
    }
  }

  return profile;
}

export function buildSearchCardSkillRateProfiles(
  cards: CalculatedBandoriCard[],
  input: BandoriTeamSearchInput,
  chart: PreparedChart,
  server: number,
  comboOptions?: ScoreComboOptions,
): Map<string, SearchCardSkillRateProfile> {
  return new Map(cards.map((card) => [
    getCardInstanceKey(card),
    getCachedSearchCardSkillRateProfile(card, input, chart, server, comboOptions),
  ]));
}

export function pruneDominatedAreaItemConfigurations(
  configurations: BandoriAreaItemConfiguration[],
  cards: CalculatedBandoriCard[],
  input: BandoriTeamSearchInput,
  server: number,
): BandoriAreaItemConfiguration[] {
  // If configuration A gives every candidate card at least as much item power as B, and one card more, B can never win.
  // This pruning uses only area-item deltas and does not depend on heuristic ordering, so exactness is preserved.
  const userAreaItemsById = toAreaItemStateMap(input.userAreaItems);
  const uniqueConfigurations = new Map<string, BandoriAreaItemConfiguration>();
  configurations.forEach((configuration) => {
    const key = getAreaItemConfigurationKey(configuration);
    if (!uniqueConfigurations.has(key)) {
      uniqueConfigurations.set(key, configuration);
    }
  });
  const entries = [...uniqueConfigurations.values()].map((configuration) => ({
    configuration,
    bonuses: Float64Array.from(cards.map((card) => getAreaItemBonusForCard(
      card,
      input.areaItemsById,
      userAreaItemsById,
      configuration.selectedAreaItemIds,
      server,
    ))),
  }));
  const dominated = new Set<number>();

  for (let rightIndex = 0; rightIndex < entries.length; rightIndex += 1) {
    if (dominated.has(rightIndex)) {
      continue;
    }
    for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
      if (leftIndex === rightIndex || dominated.has(leftIndex)) {
        continue;
      }
      let allGreaterOrEqual = true;
      let strictlyGreater = false;
      for (let cardIndex = 0; cardIndex < cards.length; cardIndex += 1) {
        const delta = entries[leftIndex].bonuses[cardIndex] - entries[rightIndex].bonuses[cardIndex];
        if (delta < -0.000001) {
          allGreaterOrEqual = false;
          break;
        }
        if (delta > 0.000001) {
          strictlyGreater = true;
        }
      }
      if (allGreaterOrEqual && strictlyGreater) {
        dominated.add(rightIndex);
        break;
      }
    }
  }

  return entries
    .filter((_, index) => !dominated.has(index))
    .map((entry) => entry.configuration);
}

export function getAreaItemBonusForCard(
  card: CalculatedBandoriCard,
  areaItemsById: Record<string, BestdoriAreaItemMaster | undefined>,
  userAreaItemsById: Record<string, BandoriUserAreaItemState | undefined>,
  selectedAreaItemIds: number[],
  server: number,
): number {
  return selectedAreaItemIds.reduce((power, areaItemId) => {
    const areaItem = areaItemsById[String(areaItemId)];
    const level = userAreaItemsById[String(areaItemId)]?.level ?? 0;
    if (!areaItem || level <= 0) {
      return power;
    }

    const targetAttributes = Array.isArray(areaItem.targetAttributes) ? areaItem.targetAttributes : [];
    const targetBandIds = Array.isArray(areaItem.targetBandIds) ? areaItem.targetBandIds.map((item) => Math.trunc(toFiniteNumber(item))) : [];
    if (!targetAttributes.includes(card.attribute) || card.bandId === null || !targetBandIds.includes(card.bandId)) {
      return power;
    }

    return power + calculateBandoriRoundedParamBonusPower(card.characterParam, [
      getRegionalNumber(areaItem.performance?.[String(level)], server) / 100,
      getRegionalNumber(areaItem.technique?.[String(level)], server) / 100,
      getRegionalNumber(areaItem.visual?.[String(level)], server) / 100,
    ]);
  }, 0);
}

export function buildCalculatedCards(input: BandoriTeamSearchInput): CalculatedBandoriCard[] {
  const characterBonusesById = Object.fromEntries(
    input.characterBonuses.map((bonus) => [String(bonus.characterId), bonus]),
  );
  return input.userCards
    .filter((card) => !card.isExcluded)
    .flatMap((state) => {
      const card = input.cardsById[String(state.cardId)];
      if (!card) {
        return [];
      }
      return calculateBandoriCard(state, card, input.charactersById, characterBonusesById);
    });
}

function shouldUseMissionSupportBand(input: BandoriTeamSearchInput): boolean {
  return normalizeSearchEventType(input.eventType) === "mission_live"
    && normalizeSearchTarget(input.target) === "eventPoint"
    && resolveBandoriTeamSearchEventMode(input.eventType, input.liveType) === "pointBonus";
}

function calculateSupportCardPower(card: CalculatedBandoriCard, input: BandoriTeamSearchInput): number {
  return calculateBandoriSupportCardEventBonus(card, input.eventBonus).supportPower;
}

function compareSupportBandCandidates(left: SupportBandCandidate, right: SupportBandCandidate): number {
  return (
    right.supportPower - left.supportPower
    || right.card.totalPower - left.card.totalPower
    || compareCardInstanceKey(left.card, right.card)
  );
}

function selectSupportBandCandidates(
  candidates: SupportBandCandidate[],
  excludedCardKeys: readonly string[],
): SupportBandSelection {
  const supportCards: SupportBandCandidate[] = [];
  const excludedCardKeySet = new Set(excludedCardKeys);
  const usedCharacterIds = new Set<number>();
  let supportBandPower = 0;

  for (const candidate of candidates) {
    if (excludedCardKeySet.has(getCardInstanceKey(candidate.card)) || usedCharacterIds.has(candidate.card.characterId)) {
      continue;
    }

    supportCards.push(candidate);
    usedCharacterIds.add(candidate.card.characterId);
    supportBandPower += candidate.supportPower;
    if (supportCards.length === 5) {
      break;
    }
  }

  return {
    supportBandPower,
    supportCards,
  };
}

export function createSupportBandContext(input: BandoriTeamSearchInput, cards: CalculatedBandoriCard[]): SupportBandContext {
  const enabled = shouldUseMissionSupportBand(input);
  if (!enabled) {
    return {
      enabled: false,
      candidates: [],
      supportPowerByCardKey: new Map(),
      supportBandPowerUpperBound: 0,
      supportBandPointUpperBound: 0,
      evaluationCount: 0,
      skippedByUpperBoundCount: 0,
      selectionCache: new Map(),
    };
  }

  const candidates = cards
    .map((card) => ({
      card,
      supportPower: calculateSupportCardPower(card, input),
    }))
    .sort(compareSupportBandCandidates);
  const upperSelection = selectSupportBandCandidates(candidates, []);
  // supportBandPointUpperBound contributes to the PT bound; real team evaluation reselects after excluding main-team cards and duplicate characters.
  const supportPowerByCardKey = new Map(candidates.map((candidate) => [
    getCardInstanceKey(candidate.card),
    candidate.supportPower,
  ]));

  return {
    enabled: true,
    candidates,
    supportPowerByCardKey,
    supportBandPowerUpperBound: upperSelection.supportBandPower,
    supportBandPointUpperBound: Math.floor(upperSelection.supportBandPower / 3000),
    evaluationCount: 0,
    skippedByUpperBoundCount: 0,
    selectionCache: new Map(),
  };
}

function getSupportSelectionKey(cards: readonly SearchCard[]): string {
  return getCardInstanceKeys(cards).sort().join(",");
}

export function resolveSupportBandForTeam(cards: readonly SearchCard[], context?: SupportBandContext): SupportBandSelection | null {
  if (!context?.enabled) {
    return null;
  }

  const key = getSupportSelectionKey(cards);
  const cached = context.selectionCache.get(key);
  if (cached) {
    return cached;
  }

  context.evaluationCount += 1;
  const selection = selectSupportBandCandidates(
    context.candidates,
    getCardInstanceKeys(cards),
  );
  context.selectionCache.set(key, selection);
  return selection;
}

export function buildSearchCardsForConfiguration(
  cards: CalculatedBandoriCard[],
  input: BandoriTeamSearchInput,
  configuration: BandoriAreaItemConfiguration,
  server: number,
  skillRateProfiles: Map<string, SearchCardSkillRateProfile>,
  supportBandContext?: SupportBandContext,
  precomputed?: SearchPrecomputedData,
): SearchCard[] {
  // SearchCard is the compact hot-path representation: all expensive card/item/event/support
  // values are materialized once before DFS or medley slot enumeration.
  const userAreaItemsById = toAreaItemStateMap(input.userAreaItems);
  const eventMode = resolveBandoriTeamSearchEventMode(input.eventType, input.liveType);
  const configurationKey = getAreaItemConfigurationKey(configuration);
  const areaItemPowers = precomputed?.areaItemPowerByConfigurationKey.get(configurationKey);
  return cards.map((card, index) => {
    const itemPower = areaItemPowers?.[index] ?? getAreaItemBonusForCard(
      card,
      input.areaItemsById,
      userAreaItemsById,
      configuration.selectedAreaItemIds,
      server,
    );
    const cardKey = getCardInstanceKey(card);
    const staticProfile = precomputed?.cardStaticProfilesByKey.get(cardKey);
    const eventBonus = staticProfile ? null : calculateBandoriCardEventBonus(card, input.eventBonus);
    const eventPower = eventMode === "parameterPower"
      ? staticProfile?.eventPower ?? (
        input.useSpecialRoomBonus
          ? PARAMETER_KEYS.reduce((sum, _, bonusIndex) => sum + (eventBonus?.parameterBonusWithRoom[bonusIndex] ?? 0), 0)
          : PARAMETER_KEYS.reduce((sum, _, bonusIndex) => sum + (eventBonus?.parameterBonus[bonusIndex] ?? 0), 0)
      )
      : 0;
    const skillRateProfile = staticProfile ?? skillRateProfiles.get(cardKey);
    if (!skillRateProfile) {
      throw new Error(`Missing search skill rate profile for card ${card.cardId}`);
    }
    return {
      ...card,
      effectivePower: card.totalPower + itemPower + eventPower,
      pointBonusRate: staticProfile?.pointBonusRate ?? eventBonus?.pointBonusRate ?? 0,
      supportPower: staticProfile?.supportPower ?? supportBandContext?.supportPowerByCardKey.get(cardKey) ?? 0,
      skillSearchSignature: staticProfile?.skillSignature
        ?? buildSkillSearchSignature(card.skillId, input.skillsById[String(card.skillId)], card.skillLevel, server),
      ...skillRateProfile,
    };
  });
}

export function buildSkillSearchSignature(
  skillId: number,
  skill: BestdoriSkillMaster | undefined,
  skillLevel: number,
  server: number,
): string {
  // Candidate compression can compare only cards with identical search behavior, so the signature includes conditions, values, and duration.
  if (!skill) {
    return `${skillId}:${skillLevel}:missing`;
  }

  const normalizedSkillLevel = clamp(Math.trunc(skillLevel), 1, 5);
  const effects = Object.entries(skill.activationEffect?.activateEffectTypes ?? {})
    .filter(([type]) => type === "score_rate_up_with_perfect" || Boolean(getRegionalNumber(skill.activationEffect?.activateEffectTypes?.[type]?.activateEffectValue, server)))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, effect]) => [
      type,
      getRegionalNumber(effect.activateEffectValue, server) ?? 0,
      effect.activateCondition ?? "none",
      getRegionalNumber(effect.activateConditionLife, server) ?? 0,
    ].join("/"))
    .join("|");

  return [
    getSkillDurationSeconds(skill, normalizedSkillLevel, server),
    skill.activationEffect?.unificationActivateConditionBandId ?? "none",
    skill.activationEffect?.unificationActivateConditionType ?? "none",
    getRegionalNumber(skill.activationEffect?.unificationActivateEffectValue, server) ?? 0,
    effects,
  ].join(":");
}

export function groupSearchCardsByCharacter(cards: SearchCard[]): SearchCard[] {
  // DFS processes one character group per level so duplicate-character teams are impossible by construction.
  const groups = new Map<number, SearchCard[]>();
  for (const card of cards) {
    const group = groups.get(card.characterId);
    if (group) {
      group.push(card);
    } else {
      groups.set(card.characterId, [card]);
    }
  }
  return [...groups.values()].flat();
}

export function buildSearchCardGroups(cards: SearchCard[], upperBoundIndex: CharacterUpperBoundIndex): SearchCardGroup[] {
  const groups: SearchCardGroup[] = [];
  let currentGroup: SearchCardGroup | null = null;
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    if (!currentGroup || currentGroup.characterId !== card.characterId) {
      const characterIndex = upperBoundIndex.characterIndexById.get(card.characterId);
      if (characterIndex === undefined) {
        continue;
      }
      currentGroup = {
        characterId: card.characterId,
        characterIndex,
        startIndex: index,
        cards: [],
      };
      groups.push(currentGroup);
    }
    currentGroup.cards.push(card);
  }
  return groups;
}

function getSearchCardTraversalValue(
  card: SearchCard,
  baseScoreRatePerPower: number,
  target: BandoriTeamSearchTarget,
  eventMode: BandoriTeamSearchEventMode,
  objective?: SearchObjectiveAdapter,
): number {
  if (objective) {
    return objective.getTraversalValue(card, baseScoreRatePerPower);
  }
  const scorePotential = card.effectivePower * (baseScoreRatePerPower + card.skillAverageRate + card.skillLeaderRate);
  if (target === "eventPoint" && eventMode === "pointBonus") {
    return scorePotential * (1 + Math.max(0, card.pointBonusRate)) + Math.max(0, card.pointBonusRate) * 1_000_000;
  }
  return scorePotential;
}

export function sortSearchCardsForTraversal(
  cards: SearchCard[],
  baseScoreRatePerPower: number,
  target: BandoriTeamSearchTarget = "score",
  eventMode: BandoriTeamSearchEventMode = "none",
  objective?: SearchObjectiveAdapter,
): SearchCard[] {
  return [...cards].sort((left, right) => {
    return (
      getSearchCardTraversalValue(right, baseScoreRatePerPower, target, eventMode, objective)
      - getSearchCardTraversalValue(left, baseScoreRatePerPower, target, eventMode, objective)
      || right.pointBonusRate - left.pointBonusRate
      || left.supportPower - right.supportPower
      || right.effectivePower - left.effectivePower
      || right.totalPower - left.totalPower
      || compareCardInstanceKey(left, right)
    );
  });
}
