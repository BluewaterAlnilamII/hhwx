/*
 * Exact five-card team evaluation shared by single and medley search.
 *
 * Search modules should call this only after candidate pruning has produced a concrete team.
 * It resolves conditional skills with the real team context and hydrates the final result shape.
 */
import { calculateBandoriCardEventBonus, calculateBandoriSelectedAreaItemPower } from "@/lib/bandori-team-calculator";
import { buildCalculatedCards, buildSearchCardsForConfiguration, buildSearchCardSkillRateProfiles, createSupportBandContext, resolveSupportBandForTeam, toAreaItemStateMap } from "./cards";
import { getCachedPreparedChart } from "./chart";
import { calculateBestMultiLiveScoreForSkillWindows, calculateBestScoreForNonOverlappingSkillWindows, calculateBestScoreForNonOverlappingSkillWindowsTargetOnly, type SkillWindowScoreResult } from "./scoring";
import { calculateChallengeLiveEventPoint, calculateChallengeLiveEventPointBase, calculateEventPoint, calculateEventPointBeforeMultiplier, calculateRoomScore, createEventPointOptions, getSearchCardsTeamContext, getEventPointMultiplier, getTargetValue, isChallengeLiveEventPointInput, normalizeSearchEventType, normalizeSearchLiveType, normalizeSearchTarget, resolveCachedBandoriSkill, resolveEncoreSkill, resolveOtherPlayerSkills, resolveBandoriTeamSearchEventMode } from "./events";
import { isSearchUpperBoundBelowResultThreshold } from "./character-bounds";
import { getCardInstanceKey } from "./card-identity";
import type { CalculatedBandoriCard } from "@/lib/bandori-team-calculator";
import type { BandoriAreaItemConfiguration, BandoriTeamSearchResult, BandoriTeamSearchInput, PreparedChart, ScoreCalculationCache, ScoreComboOptions, SearchCard, SupportBandCandidate, SupportBandContext, BandoriTeamSearchResultCard, BandoriTeamSearchSupportCard } from "./types";
import { clamp } from "./utils";

function toCoreResultCards(cards: CalculatedBandoriCard[]): BandoriTeamSearchResultCard[] {
  return cards.map((card) => ({
    cardId: card.cardId,
    cardInstanceKey: card.cardInstanceKey,
    characterId: card.characterId,
    bandId: card.bandId,
    attribute: card.attribute,
    rarity: card.rarity,
    skillId: card.skillId,
    skillLevel: card.skillLevel,
    level: card.level,
    masterRank: card.masterRank,
    isTrained: card.isTrained,
    totalPower: card.totalPower,
  }));
}

function toCoreSupportResultCards(cards: SupportBandCandidate[]): BandoriTeamSearchSupportCard[] {
  return cards.map((candidate) => ({
    cardId: candidate.card.cardId,
    cardInstanceKey: candidate.card.cardInstanceKey,
    characterId: candidate.card.characterId,
    bandId: candidate.card.bandId,
    attribute: candidate.card.attribute,
    rarity: candidate.card.rarity,
    skillId: candidate.card.skillId,
    skillLevel: candidate.card.skillLevel,
    level: candidate.card.level,
    masterRank: candidate.card.masterRank,
    isTrained: candidate.card.isTrained,
    totalPower: candidate.card.totalPower,
    supportPower: candidate.supportPower,
  }));
}

function getCoreBaseCardPower(card: CalculatedBandoriCard): number {
  return card.baseParam[0] + card.baseParam[1] + card.baseParam[2];
}

export type EvaluateTeamOptions = {
  cards: SearchCard[];
  input: BandoriTeamSearchInput;
  chart: PreparedChart;
  configuration: BandoriAreaItemConfiguration;
  server: number;
  perfectRate: number;
  scoreCache?: ScoreCalculationCache;
  comboOptions?: ScoreComboOptions;
  supportBandContext?: SupportBandContext;
  pruningThresholdResult?: BandoriTeamSearchResult;
  scoreOnly?: boolean;
};

export type EvaluateMedleyScoreOnlyTeamOptions = {
  cards: SearchCard[];
  input: BandoriTeamSearchInput;
  chart: PreparedChart;
  configuration: BandoriAreaItemConfiguration;
  server: number;
  perfectRate: number;
  scoreCache?: ScoreCalculationCache;
  comboOptions?: ScoreComboOptions;
  pruningThresholdResult?: BandoriTeamSearchResult;
};

export function evaluateMedleyScoreOnlyTeam(options: EvaluateMedleyScoreOnlyTeamOptions): BandoriTeamSearchResult | null {
  const {
    cards,
    input,
    chart,
    configuration,
    server,
    perfectRate,
    scoreCache,
    comboOptions,
    pruningThresholdResult,
  } = options;
  const context = getSearchCardsTeamContext(cards);
  const resolvedSkills = cards.map((card) => {
    const skill = input.skillsById[String(card.skillId)];
    return resolveCachedBandoriSkill(card.skillId, skill, card.skillLevel, context, server, scoreCache);
  });
  const totalPower = Math.floor(cards.reduce((sum, card) => sum + card.effectivePower, 0));
  const best = calculateBestScoreForNonOverlappingSkillWindowsTargetOnly(
    chart,
    totalPower,
    resolvedSkills,
    perfectRate,
    scoreCache,
    comboOptions,
  );

  if (!Number.isFinite(best.score)) {
    return null;
  }
  if (
    pruningThresholdResult
    && isSearchUpperBoundBelowResultThreshold(best.averageScore, best.averageScore, pruningThresholdResult)
  ) {
    return null;
  }

  return {
    rank: 0,
    score: best.averageScore,
    targetValue: best.averageScore,
    averageScore: best.averageScore,
    maxScore: best.score,
    minScore: best.minScore,
    maxScoreOrderCount: best.maxScoreOrderCount,
    maxScoreOrderTotal: best.maxScoreOrderTotal,
    totalPower,
    rawCardPower: 0,
    areaItemPower: 0,
    eventPower: 0,
    eventPowerWithRoom: 0,
    pointBonusRate: 0,
    eventPointBase: null,
    eventPointMultiplier: 1,
    eventPoint: null,
    eventPointOptions: { mode: "none", defaultKey: null, options: [] },
    eventMode: "parameterPower",
    roomScore: null,
    supportBandPower: null,
    supportCards: [],
    liveType: "free",
    eventType: "medley",
    target: "score",
    leaderCardId: cards[best.leaderIndex]?.cardId ?? cards[0]?.cardId ?? 0,
    leaderCardInstanceKey: cards[best.leaderIndex] ? getCardInstanceKey(cards[best.leaderIndex]) : cards[0] ? getCardInstanceKey(cards[0]) : undefined,
    skillOrderCardIds: [],
    areaItemConfiguration: configuration,
    context,
    cards: [],
    skills: [],
  };
}

export function evaluateMedleyScoreOnlyTeamScore(options: EvaluateMedleyScoreOnlyTeamOptions): number | null {
  const {
    cards,
    input,
    chart,
    server,
    perfectRate,
    scoreCache,
    comboOptions,
    pruningThresholdResult,
  } = options;
  const context = getSearchCardsTeamContext(cards);
  const resolvedSkills = cards.map((card) => {
    const skill = input.skillsById[String(card.skillId)];
    return resolveCachedBandoriSkill(card.skillId, skill, card.skillLevel, context, server, scoreCache);
  });
  const totalPower = Math.floor(cards.reduce((sum, card) => sum + card.effectivePower, 0));
  const best = calculateBestScoreForNonOverlappingSkillWindowsTargetOnly(
    chart,
    totalPower,
    resolvedSkills,
    perfectRate,
    scoreCache,
    comboOptions,
  );

  if (!Number.isFinite(best.score)) {
    return null;
  }
  if (
    pruningThresholdResult
    && isSearchUpperBoundBelowResultThreshold(best.averageScore, best.averageScore, pruningThresholdResult)
  ) {
    return null;
  }

  return best.averageScore;
}

export function evaluateTeam(options: EvaluateTeamOptions): BandoriTeamSearchResult | null {
  const {
    cards,
    input,
    chart,
    configuration,
    server,
    perfectRate,
    scoreCache,
    comboOptions,
    supportBandContext,
    pruningThresholdResult,
    scoreOnly = false,
  } = options;
  // evaluateTeam is the only path that hydrates five candidate cards into display results:
  // resolve skills with full team context, then calculate score, room score, event points, support band, and presentation fields.
  const context = getSearchCardsTeamContext(cards);
  const resolvedSkills = cards.map((card) => {
    const skill = input.skillsById[String(card.skillId)];
    return resolveCachedBandoriSkill(card.skillId, skill, card.skillLevel, context, server, scoreCache);
  });
  const eventMode = resolveBandoriTeamSearchEventMode(input.eventType, input.liveType);
  const eventBonuses = cards.map((card) => calculateBandoriCardEventBonus(card, input.eventBonus));
  const pointBonusRate = eventMode === "pointBonus"
    ? Math.round(eventBonuses.reduce((sum, bonus) => sum + bonus.pointBonusRate, 0) * 100) / 100
    : 0;
  const totalPower = Math.floor(cards.reduce((sum, card) => sum + card.effectivePower, 0));
  const target = normalizeSearchTarget(input.target);
  const liveType = normalizeSearchLiveType(input.liveType);
  const eventType = normalizeSearchEventType(input.eventType);
  const otherPlayerSkills = resolveOtherPlayerSkills(input, context, server, scoreCache);
  const shouldCalculateDetailedScore = pruningThresholdResult
    ? (targetOnlyResult: SkillWindowScoreResult): boolean => {
      // If the target-only estimate cannot enter top-N, skip max/min and skill-order detail work.
      const preliminaryRoomScore = calculateRoomScore(
        targetOnlyResult.rawAverageScore ?? targetOnlyResult.averageScore,
        totalPower,
        input,
        targetOnlyResult.roomScoreRatePerPower,
      );
      const preliminarySupportPower = supportBandContext?.enabled && eventMode === "pointBonus"
        ? supportBandContext.supportBandPowerUpperBound
        : 0;
      const preliminaryEventPoint = eventMode === "pointBonus"
        ? calculateEventPointBeforeMultiplier(
          targetOnlyResult.rawAverageScore ?? targetOnlyResult.averageScore,
          preliminaryRoomScore,
          pointBonusRate,
          input,
          preliminarySupportPower,
        )
        : isChallengeLiveEventPointInput(input)
          ? calculateChallengeLiveEventPointBase(targetOnlyResult.averageScore, input)
          : null;
      const preliminaryTargetValue = getTargetValue({
        totalPower,
        averageScore: targetOnlyResult.averageScore,
        eventPoint: preliminaryEventPoint,
        eventMode,
      }, target);
      return !isSearchUpperBoundBelowResultThreshold(
        preliminaryTargetValue,
        targetOnlyResult.averageScore,
        pruningThresholdResult,
      );
    }
    : undefined;
  const calculateBest = (targetOnly: boolean): SkillWindowScoreResult => otherPlayerSkills.length > 0
    ? calculateBestMultiLiveScoreForSkillWindows(
      chart,
      totalPower,
      resolvedSkills,
      otherPlayerSkills,
      input.encoreSkillSource,
      cards,
      perfectRate,
      scoreCache,
      comboOptions,
      targetOnly,
      shouldCalculateDetailedScore,
    )
    : calculateBestScoreForNonOverlappingSkillWindows(
      chart,
      totalPower,
      resolvedSkills,
      perfectRate,
      scoreCache,
      resolveEncoreSkill(input, context, server, scoreCache),
      comboOptions,
      targetOnly,
      shouldCalculateDetailedScore,
    );
  const best = calculateBest(scoreOnly);

  if (!Number.isFinite(best.score)) {
    return null;
  }

  const scoreForRoomAndPoint = best.rawAverageScore ?? best.averageScore;
  const roomScore = calculateRoomScore(scoreForRoomAndPoint, totalPower, input, best.roomScoreRatePerPower);

  if (pruningThresholdResult) {
    const preliminarySupportPower = supportBandContext?.enabled && eventMode === "pointBonus"
      ? supportBandContext.supportBandPowerUpperBound
      : 0;
    const preliminaryEventPoint = eventMode === "pointBonus"
      ? calculateEventPointBeforeMultiplier(scoreForRoomAndPoint, roomScore, pointBonusRate, input, preliminarySupportPower)
      : isChallengeLiveEventPointInput(input)
        ? calculateChallengeLiveEventPointBase(best.averageScore, input)
        : null;
    const preliminaryTargetValue = getTargetValue({
      totalPower,
      averageScore: best.averageScore,
      eventPoint: preliminaryEventPoint,
      eventMode,
    }, normalizeSearchTarget(input.target));
    if (isSearchUpperBoundBelowResultThreshold(
      preliminaryTargetValue,
      best.averageScore,
      pruningThresholdResult,
    )) {
      if (supportBandContext?.enabled && eventMode === "pointBonus") {
        supportBandContext.skippedByUpperBoundCount += 1;
      }
      return null;
    }
  }

  if (scoreOnly) {
    return {
      rank: 0,
      score: best.averageScore,
      targetValue: best.averageScore,
      averageScore: best.averageScore,
      maxScore: best.score,
      minScore: best.minScore,
      maxScoreOrderCount: best.maxScoreOrderCount,
      maxScoreOrderTotal: best.maxScoreOrderTotal,
      totalPower,
      rawCardPower: 0,
      areaItemPower: 0,
      eventPower: 0,
      eventPowerWithRoom: 0,
      pointBonusRate,
      eventPointBase: null,
      eventPointMultiplier: 1,
      eventPoint: null,
      eventPointOptions: { mode: "none", defaultKey: null, options: [] },
      eventMode,
      roomScore: null,
      supportBandPower: null,
      supportCards: [],
      liveType,
      eventType,
      target,
      leaderCardId: cards[best.leaderIndex]?.cardId ?? cards[0]?.cardId ?? 0,
      leaderCardInstanceKey: cards[best.leaderIndex] ? getCardInstanceKey(cards[best.leaderIndex]) : cards[0] ? getCardInstanceKey(cards[0]) : undefined,
      skillOrderCardIds: [],
      areaItemConfiguration: configuration,
      context,
      cards: [],
      skills: [],
    };
  }

  const supportBand = resolveSupportBandForTeam(cards, supportBandContext);
  const supportBandPower = supportBand?.supportBandPower ?? 0;
  const eventPointBase = eventMode === "pointBonus"
    ? calculateEventPointBeforeMultiplier(scoreForRoomAndPoint, roomScore, pointBonusRate, input, supportBandPower)
    : isChallengeLiveEventPointInput(input)
      ? calculateChallengeLiveEventPointBase(scoreForRoomAndPoint, input)
      : null;
  const eventPointOptions = createEventPointOptions(scoreForRoomAndPoint, eventPointBase, input);
  const defaultEventPointOption = (
    eventPointOptions.options.find((option) => option.key === eventPointOptions.defaultKey)
    ?? eventPointOptions.options[0]
    ?? null
  );
  const eventPointMultiplier = defaultEventPointOption?.multiplier ?? (eventPointBase === null ? 1 : getEventPointMultiplier(input));
  const eventPoint = defaultEventPointOption?.eventPoint ?? (
    eventMode === "pointBonus"
      ? calculateEventPoint(scoreForRoomAndPoint, roomScore, pointBonusRate, input, supportBandPower)
      : isChallengeLiveEventPointInput(input)
        ? calculateChallengeLiveEventPoint(scoreForRoomAndPoint, input)
        : null
  );
  const targetEventPoint = eventType === "versus" || eventType === "festival" ? null : eventPointBase;
  const targetValue = getTargetValue({ totalPower, averageScore: best.averageScore, eventPoint: targetEventPoint, eventMode }, target);
  if (
    pruningThresholdResult
    && isSearchUpperBoundBelowResultThreshold(targetValue, best.averageScore, pruningThresholdResult)
  ) {
    return null;
  }

  const skillOrderCardIds = best.skillOrderCardIds ?? [
    ...best.permutation.map((cardIndex) => cards[cardIndex].cardId),
    cards[best.leaderIndex].cardId,
  ];
  const skillOrderCardInstanceKeys = best.skillOrderCardIds
    ? undefined
    : [
      ...best.permutation.map((cardIndex) => getCardInstanceKey(cards[cardIndex])),
      getCardInstanceKey(cards[best.leaderIndex]),
    ];
  const skillOrderActors = best.skillOrderActors;
  const baseCardPower = cards.reduce((sum, card) => sum + getCoreBaseCardPower(card), 0);
  const userAreaItemsById = toAreaItemStateMap(input.userAreaItems);
  const areaItemResult = calculateBandoriSelectedAreaItemPower(
    cards,
    input.areaItemsById,
    userAreaItemsById,
    configuration.selectedAreaItemIds,
    server,
  );
  const eventPower = Math.floor(eventBonuses.reduce((sum, bonus) => (
    sum + bonus.parameterBonus[0] + bonus.parameterBonus[1] + bonus.parameterBonus[2]
  ), 0));
  const eventPowerWithRoom = Math.floor(eventBonuses.reduce((sum, bonus) => (
    sum + bonus.parameterBonusWithRoom[0] + bonus.parameterBonusWithRoom[1] + bonus.parameterBonusWithRoom[2]
  ), 0));

  return {
    rank: 0,
    score: best.averageScore,
    targetValue,
    averageScore: best.averageScore,
    maxScore: best.score,
    minScore: best.minScore,
    maxScoreOrderCount: best.maxScoreOrderCount,
    maxScoreOrderTotal: best.maxScoreOrderTotal,
    totalPower,
    rawCardPower: baseCardPower,
    areaItemPower: areaItemResult.power,
    eventPower,
    eventPowerWithRoom,
    pointBonusRate,
    eventPointBase,
    eventPointMultiplier,
    eventPoint,
    eventPointOptions,
    eventMode,
    roomScore,
    supportBandPower: supportBand?.supportBandPower ?? null,
    supportCards: supportBand ? toCoreSupportResultCards(supportBand.supportCards) : [],
    liveType,
    eventType,
    target,
    leaderCardId: cards[best.leaderIndex].cardId,
    leaderCardInstanceKey: getCardInstanceKey(cards[best.leaderIndex]),
    skillOrderCardIds,
    skillOrderCardInstanceKeys,
    skillOrderActors,
    areaItemConfiguration: {
      ...configuration,
      selectedAreaItemIds: areaItemResult.selectedAreaItemIds,
    },
    context,
    cards: toCoreResultCards(cards),
    skills: cards.map((card, index) => ({
      cardId: card.cardId,
      cardInstanceKey: card.cardInstanceKey,
      skillId: card.skillId,
      skillLevel: card.skillLevel,
      resolvedSkill: resolvedSkills[index],
    })),
  };
}

export function evaluateBandoriTeamByCardIds(
  input: BandoriTeamSearchInput,
  cardIds: readonly number[],
  configuration: BandoriAreaItemConfiguration,
  comboOptions?: ScoreComboOptions,
): BandoriTeamSearchResult | null {
  // Debug/validation entry point: run the same evaluateTeam path for a fixed five-card team and area configuration.
  const server = input.server ?? 3;
  const perfectRate = clamp(input.perfectRate ?? 1, 0, 1);
  const chart = getCachedPreparedChart(input);
  const calculatedCards = buildCalculatedCards(input);
  const supportBandContext = createSupportBandContext(input, calculatedCards);
  const skillRateProfiles = buildSearchCardSkillRateProfiles(calculatedCards, input, chart, server);
  const searchCards = buildSearchCardsForConfiguration(
    calculatedCards,
    input,
    configuration,
    server,
    skillRateProfiles,
    supportBandContext,
  );
  const cardsById = new Map(searchCards.map((card) => [card.cardId, card]));
  const cards = cardIds.map((cardId) => cardsById.get(cardId));

  if (cards.length !== 5 || cards.some((card) => !card)) {
    return null;
  }

  const uniqueCardIds = new Set(cards.map((card) => card?.cardId));
  const uniqueCharacterIds = new Set(cards.map((card) => card?.characterId));
  if (uniqueCardIds.size !== 5 || uniqueCharacterIds.size !== 5) {
    return null;
  }

  return evaluateTeam({
    cards: cards as SearchCard[],
    input,
    chart,
    configuration,
    server,
    perfectRate,
    scoreCache: {
      judgeLists: new Map(),
      innerScoreRates: new Map(),
      baseScoresByChart: new WeakMap(),
      noFloorBaseScoreRates: new Map(),
      skillMultiplierLists: new Map(),
      noFloorSkillRates: new Map(),
      skillWindowContributionsByChart: new WeakMap(),
      resolvedSkills: new Map(),
    },
    comboOptions,
    supportBandContext,
  });
}

export function createScoreCalculationCache(): ScoreCalculationCache {
  return {
    judgeLists: new Map(),
    innerScoreRates: new Map(),
    baseScoresByChart: new WeakMap(),
    noFloorBaseScoreRates: new Map(),
    skillMultiplierLists: new Map(),
    noFloorSkillRates: new Map(),
    skillWindowContributionsByChart: new WeakMap(),
    resolvedSkills: new Map(),
  };
}
