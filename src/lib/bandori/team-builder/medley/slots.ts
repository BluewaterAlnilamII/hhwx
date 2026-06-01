/*
 * Slot-level preparation and exact single-slot helpers for medley search.
 *
 * A slot is one song in the three-song medley. This module builds the shared-card search
 * view for each slot, prunes dominated slot cards, and solves constrained single-slot teams.
 */

import { getMedleyTeamEvaluationCacheKey } from "./candidates";
import { MEDLEY_TEAM_COUNT, MEDLEY_TEAM_SIZE } from "./constants";
import { estimateMedleyRemainingScoreUpperBound } from "./upper/capacity";
import { getMedleyCapacityTransition } from "./upper/capacity-core";
import { estimateMedleySlotBranchScoreUpperBound } from "./upper/skill-context";
import {
  getMedleyCardSkillAverageRateUpper,
  getMedleyCardSkillLeaderRateUpper,
} from "./upper/skill-context";
import {
  CHARACTER_MASK_SEGMENT_BITS,
  buildCharacterUpperBoundIndex,
  buildSearchCardSkillRateProfiles,
  buildSearchCardsForConfiguration,
  calculateBaseScoreRatePerPower,
  estimateSearchScopeScoreUpperBound,
  evaluateTeam,
  getCachedPreparedChart,
  hasCharacterIndexInMask,
  insertTopValue,
  sortSearchCardsForTraversal,
} from "@/lib/bandori/team-builder/core";
import {
  getAreaItemBonusForCard,
  toAreaItemStateMap,
} from "@/lib/bandori/team-builder/core/cards";
import type {
  BandoriMedleySongSearchInput,
  BandoriMedleyTeamSearchInput,
  BandoriMedleyTeamSearchProfilingStats,
  BandoriMedleyTeamSearchStats,
  MedleyBestSlotTeamCacheEntry,
  MedleySlotAvailability,
  MedleySlotSearch,
  MedleyTeamCandidate,
} from "./types";
import type { CalculatedBandoriCard } from "@/lib/bandori-team-calculator";
import type {
  BandoriAreaItemConfiguration,
  BandoriTeamSearchInput,
  PreparedChart,
  ScoreComboOptions,
  SearchCard,
  SearchCardSkillRateProfile,
} from "@/lib/bandori/team-builder/core";

export type MedleySlotBuildContext = {
  songIndex: number;
  startCombo: number;
  chart: PreparedChart;
  input: BandoriTeamSearchInput;
  comboOptions: ScoreComboOptions;
  baseScoreRatePerPower: number;
  skillRateProfiles: Map<number, SearchCardSkillRateProfile>;
};

type LightweightMedleyCapacityCard = {
  cardId: number;
  characterId: number;
  effectivePower: number;
  skillAverageRateUpper: number;
  skillLeaderRateUpper: number;
};

type LightweightMedleySlot = {
  searchCards: LightweightMedleyCapacityCard[];
  baseScoreRatePerPower: number;
};

export function createMedleySlotInput(
  input: BandoriMedleyTeamSearchInput,
  songInput: BandoriMedleySongSearchInput,
): BandoriTeamSearchInput {
  const { songs, target, ...commonInput } = input;
  void songs;
  void target;
  return {
    ...commonInput,
    chart: songInput.chart,
    chartCacheKey: songInput.chartCacheKey,
    song: songInput.song,
    difficulty: songInput.difficulty,
    // Medley lives do not have fever sections, regardless of caller-provided song flags.
    eventType: "medley",
    useFever: false,
    liveType: "free",
    target: "score",
    useSpecialRoomBonus: false,
  };
}

export function buildMedleySlotBuildContexts(
  input: BandoriMedleyTeamSearchInput,
  songInputs: BandoriMedleySongSearchInput[],
  calculatedCards: CalculatedBandoriCard[],
  server: number,
): MedleySlotBuildContext[] {
  let startCombo = 0;
  return songInputs.map((songInput, songIndex) => {
    const slotInput = createMedleySlotInput(input, songInput);
    const chart = getCachedPreparedChart(slotInput);
    const comboOptions = {
      startCombo,
      useMedleyCombo: true,
    };
    const baseScoreRatePerPower = calculateBaseScoreRatePerPower(chart, comboOptions);
    const skillRateProfiles = buildSearchCardSkillRateProfiles(
      calculatedCards,
      slotInput,
      chart,
      server,
      comboOptions,
    );
    const context: MedleySlotBuildContext = {
      songIndex,
      startCombo,
      chart,
      input: slotInput,
      comboOptions,
      baseScoreRatePerPower,
      skillRateProfiles,
    };
    startCombo += chart.notesCount;
    return context;
  });
}

function estimateLightweightSlotEffectivePowerUpperBound(slot: LightweightMedleySlot): number {
  const bestPowerByCharacter = new Map<number, number>();
  for (const card of slot.searchCards) {
    bestPowerByCharacter.set(
      card.characterId,
      Math.max(bestPowerByCharacter.get(card.characterId) ?? Number.NEGATIVE_INFINITY, card.effectivePower),
    );
  }
  if (bestPowerByCharacter.size < MEDLEY_TEAM_SIZE) {
    return Number.NEGATIVE_INFINITY;
  }

  const topPowers = new Array<number>(MEDLEY_TEAM_SIZE).fill(Number.NEGATIVE_INFINITY);
  for (const power of bestPowerByCharacter.values()) {
    insertTopValue(topPowers, power);
  }
  return topPowers.reduce((sum, power) => sum + power, 0);
}

function estimateLightweightSlotSkillCoefficient(slot: LightweightMedleySlot): number {
  const averageRateByCharacter = new Map<number, number>();
  const leaderRateByCharacter = new Map<number, number>();

  for (const card of slot.searchCards) {
    const averageRate = card.skillAverageRateUpper;
    const leaderRate = card.skillLeaderRateUpper;
    averageRateByCharacter.set(
      card.characterId,
      Math.max(averageRateByCharacter.get(card.characterId) ?? 0, averageRate),
    );
    leaderRateByCharacter.set(
      card.characterId,
      Math.max(leaderRateByCharacter.get(card.characterId) ?? 0, leaderRate),
    );
  }

  if (averageRateByCharacter.size < MEDLEY_TEAM_SIZE) {
    return Number.NEGATIVE_INFINITY;
  }

  const ratesByCharacter = [...averageRateByCharacter.entries()];
  let bestCharacterDistinctSkillRate = Number.NEGATIVE_INFINITY;
  for (const [leaderCharacterId, leaderAverageRate] of ratesByCharacter) {
    const topOtherAverageRates = new Array<number>(MEDLEY_TEAM_SIZE - 1).fill(0);
    for (const [characterId, averageRate] of ratesByCharacter) {
      if (characterId !== leaderCharacterId) {
        insertTopValue(topOtherAverageRates, averageRate);
      }
    }
    const leaderRate = leaderRateByCharacter.get(leaderCharacterId) ?? 0;
    const skillRate = leaderRate
      + leaderAverageRate
      + topOtherAverageRates.reduce((sum, averageRate) => sum + averageRate, 0);
    bestCharacterDistinctSkillRate = Math.max(bestCharacterDistinctSkillRate, skillRate);
  }

  return slot.baseScoreRatePerPower + bestCharacterDistinctSkillRate;
}

export function estimateMedleyConfigurationBasicSkillAwareRootUpperBound(
  calculatedCards: CalculatedBandoriCard[],
  configuration: BandoriAreaItemConfiguration,
  server: number,
  buildContexts: MedleySlotBuildContext[],
): number {
  const firstContext = buildContexts[0];
  if (!firstContext) {
    return Number.NEGATIVE_INFINITY;
  }
  const hasEventBonus = buildContexts.some((context) => Boolean(context.input.eventBonus));
  const slots: LightweightMedleySlot[] = hasEventBonus
    ? buildContexts.map((context) => ({
      searchCards: buildSearchCardsForConfiguration(
        calculatedCards,
        context.input,
        configuration,
        server,
        context.skillRateProfiles,
      ).map((card) => ({
        cardId: card.cardId,
        characterId: card.characterId,
        effectivePower: card.effectivePower,
        skillAverageRateUpper: getMedleyCardSkillAverageRateUpper(card),
        skillLeaderRateUpper: getMedleyCardSkillLeaderRateUpper(card),
      })),
      baseScoreRatePerPower: context.baseScoreRatePerPower,
    }))
    : (() => {
      const userAreaItemsById = toAreaItemStateMap(firstContext.input.userAreaItems);
      const effectivePowers = Float64Array.from(calculatedCards.map((card) => (
        card.totalPower + getAreaItemBonusForCard(
          card,
          firstContext.input.areaItemsById,
          userAreaItemsById,
          configuration.selectedAreaItemIds,
          server,
        )
      )));
      return buildContexts.map((context) => ({
        searchCards: calculatedCards.map((card, index) => {
          const skillRateProfile = context.skillRateProfiles.get(card.cardId);
          if (!skillRateProfile) {
            throw new Error(`Missing medley slot skill rate profile for card ${card.cardId}`);
          }
          return {
            cardId: card.cardId,
            characterId: card.characterId,
            effectivePower: effectivePowers[index] ?? card.totalPower,
            skillAverageRateUpper: Math.max(
              skillRateProfile.skillAverageRate,
              skillRateProfile.skillSameBandAverageRate,
              skillRateProfile.skillSameAttributeAverageRate,
              skillRateProfile.skillBothAverageRate,
              skillRateProfile.skillMixedAverageRate,
            ),
            skillLeaderRateUpper: Math.max(
              skillRateProfile.skillLeaderRate,
              skillRateProfile.skillSameBandLeaderRate,
              skillRateProfile.skillSameAttributeLeaderRate,
              skillRateProfile.skillBothLeaderRate,
              skillRateProfile.skillMixedLeaderRate,
            ),
          };
        }),
        baseScoreRatePerPower: context.baseScoreRatePerPower,
      }));
    })();

  const slotPowerUpperBounds = slots.map(estimateLightweightSlotEffectivePowerUpperBound);
  if (slotPowerUpperBounds.some((powerUpperBound) => !Number.isFinite(powerUpperBound))) {
    return Number.NEGATIVE_INFINITY;
  }

  const slotLeaderConstants = slots.map((slot, slotPosition) => {
    let leaderRate = 0;
    for (const card of slot.searchCards) {
      leaderRate = Math.max(leaderRate, card.skillLeaderRateUpper);
    }
    return slotPowerUpperBounds[slotPosition] * leaderRate;
  });
  const slotCoefficients = slots.map(estimateLightweightSlotSkillCoefficient);
  if (slotCoefficients.some((coefficient) => !Number.isFinite(coefficient))) {
    return Number.NEGATIVE_INFINITY;
  }

  const cardsByCharacter = new Map<number, Map<number, Array<LightweightMedleyCapacityCard | undefined>>>();
  slots.forEach((slot, slotPosition) => {
    for (const card of slot.searchCards) {
      const cardsById = cardsByCharacter.get(card.characterId)
        ?? new Map<number, Array<LightweightMedleyCapacityCard | undefined>>();
      const slotCards = cardsById.get(card.cardId) ?? new Array<LightweightMedleyCapacityCard | undefined>(slots.length);
      slotCards[slotPosition] = card;
      cardsById.set(card.cardId, slotCards);
      cardsByCharacter.set(card.characterId, cardsById);
    }
  });

  const slotCount = slots.length;
  const maskCount = 1 << slotCount;
  const transition = getMedleyCapacityTransition(slotCount);
  let coefficientStates = new Float64Array(transition.stateCount);
  coefficientStates.fill(Number.NEGATIVE_INFINITY);
  coefficientStates[0] = 0;
  let skillAwareStates = new Float64Array(transition.stateCount);
  skillAwareStates.fill(Number.NEGATIVE_INFINITY);
  skillAwareStates[0] = 0;

  for (const cardsById of cardsByCharacter.values()) {
    let coefficientCharacterValues = new Float64Array(maskCount);
    coefficientCharacterValues.fill(Number.NEGATIVE_INFINITY);
    coefficientCharacterValues[0] = 0;
    let skillAwareCharacterValues = new Float64Array(maskCount);
    skillAwareCharacterValues.fill(Number.NEGATIVE_INFINITY);
    skillAwareCharacterValues[0] = 0;

    for (const slotCards of cardsById.values()) {
      const nextCoefficientCharacterValues = coefficientCharacterValues.slice();
      const nextSkillAwareCharacterValues = skillAwareCharacterValues.slice();
      for (let mask = 0; mask < maskCount; mask += 1) {
        const currentCoefficientValue = coefficientCharacterValues[mask];
        const currentSkillAwareValue = skillAwareCharacterValues[mask];
        for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
          const card = slotCards[slotPosition];
          if ((mask & (1 << slotPosition)) !== 0 || !card) {
            continue;
          }
          const nextMask = mask | (1 << slotPosition);
          if (Number.isFinite(currentCoefficientValue)) {
            nextCoefficientCharacterValues[nextMask] = Math.max(
              nextCoefficientCharacterValues[nextMask],
              currentCoefficientValue + card.effectivePower * slotCoefficients[slotPosition],
            );
          }
          if (Number.isFinite(currentSkillAwareValue)) {
            nextSkillAwareCharacterValues[nextMask] = Math.max(
              nextSkillAwareCharacterValues[nextMask],
              currentSkillAwareValue
                + card.effectivePower * slots[slotPosition].baseScoreRatePerPower
                + slotPowerUpperBounds[slotPosition] * card.skillAverageRateUpper,
            );
          }
        }
      }
      coefficientCharacterValues = nextCoefficientCharacterValues;
      skillAwareCharacterValues = nextSkillAwareCharacterValues;
    }

    const nextCoefficientStates = coefficientStates.slice();
    const nextSkillAwareStates = skillAwareStates.slice();
    for (let stateIndex = 0; stateIndex < coefficientStates.length; stateIndex += 1) {
      const currentCoefficientValue = coefficientStates[stateIndex];
      const currentSkillAwareValue = skillAwareStates[stateIndex];
      for (let mask = 1; mask < maskCount; mask += 1) {
        const nextIndex = transition.nextIndexByMask[stateIndex * maskCount + mask];
        if (nextIndex < 0) {
          continue;
        }
        const coefficientCharacterValue = coefficientCharacterValues[mask];
        if (Number.isFinite(currentCoefficientValue) && Number.isFinite(coefficientCharacterValue)) {
          nextCoefficientStates[nextIndex] = Math.max(
            nextCoefficientStates[nextIndex],
            currentCoefficientValue + coefficientCharacterValue,
          );
        }
        const skillAwareCharacterValue = skillAwareCharacterValues[mask];
        if (Number.isFinite(currentSkillAwareValue) && Number.isFinite(skillAwareCharacterValue)) {
          nextSkillAwareStates[nextIndex] = Math.max(
            nextSkillAwareStates[nextIndex],
            currentSkillAwareValue + skillAwareCharacterValue,
          );
        }
      }
    }
    coefficientStates = nextCoefficientStates;
    skillAwareStates = nextSkillAwareStates;
  }

  const coefficientUpperBound = coefficientStates[transition.targetIndex];
  const skillAwareUpperBound = skillAwareStates[transition.targetIndex]
    + slotLeaderConstants.reduce((sum, value) => sum + value, 0);
  return Math.min(coefficientUpperBound, skillAwareUpperBound);
}

export function estimateMedleySlotAvailability(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
  useContextualSkillUpper = false,
): MedleySlotAvailability {
  const availableCharacterIds = new Set<number>();
  let availableCardCount = 0;
  for (const card of slot.searchCards) {
    if (bannedCardIds.has(card.cardId)) {
      continue;
    }
    availableCardCount += 1;
    availableCharacterIds.add(card.characterId);
  }

  return {
    availableCardCount,
    availableCharacterCount: availableCharacterIds.size,
    scoreUpperBound: estimateMedleySlotBranchScoreUpperBound(
      slot,
      [],
      0,
      bannedCardIds,
      0,
      0,
      0,
      profiling,
      useContextualSkillUpper,
    ),
  };
}

export function chooseNextMedleySlotIndex(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  getMinimumScore?: (slotIndex: number) => number,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
  useContextualSkillUpper = false,
): number {
  let selectedSlotIndex = remainingSlotIndices[0] ?? 0;
  let selectedAvailability: MedleySlotAvailability | null = null;
  let selectedSlack = Number.POSITIVE_INFINITY;

  for (const slotIndex of remainingSlotIndices) {
    const availability = estimateMedleySlotAvailability(slots[slotIndex], bannedCardIds, profiling, useContextualSkillUpper);
    const minimumScore = getMinimumScore?.(slotIndex) ?? Number.NEGATIVE_INFINITY;
    const slack = availability.scoreUpperBound - minimumScore;
    if (
      !selectedAvailability
      || availability.availableCharacterCount < selectedAvailability.availableCharacterCount
      || (
        getMinimumScore
        && availability.availableCharacterCount === selectedAvailability.availableCharacterCount
        && slack < selectedSlack
      )
      || (
        availability.availableCharacterCount === selectedAvailability.availableCharacterCount
        && (!getMinimumScore || slack === selectedSlack)
        && availability.availableCardCount < selectedAvailability.availableCardCount
      )
      || (
        availability.availableCharacterCount === selectedAvailability.availableCharacterCount
        && (!getMinimumScore || slack === selectedSlack)
        && availability.availableCardCount === selectedAvailability.availableCardCount
        && availability.scoreUpperBound > selectedAvailability.scoreUpperBound
      )
    ) {
      selectedSlotIndex = slotIndex;
      selectedAvailability = availability;
      selectedSlack = slack;
    }
  }

  return selectedSlotIndex;
}

export function getMedleyDominanceVector(card: SearchCard): number[] {
  return [
    card.effectivePower,
    card.skillUpperRate,
    card.skillAverageRate,
    card.skillLeaderRate,
    card.skillSameBandAverageRate,
    card.skillSameBandLeaderRate,
    card.skillSameAttributeAverageRate,
    card.skillSameAttributeLeaderRate,
    card.skillBothAverageRate,
    card.skillBothLeaderRate,
    card.skillMixedAverageRate,
    card.skillMixedLeaderRate,
  ];
}

export function medleyCardDominatesInSlot(
  leftCardId: number,
  leftCard: SearchCard,
  rightCardId: number,
  rightCard: SearchCard,
): boolean {
  let strictlyGreater = false;
  const leftVector = getMedleyDominanceVector(leftCard);
  const rightVector = getMedleyDominanceVector(rightCard);
  for (let valueIndex = 0; valueIndex < leftVector.length; valueIndex += 1) {
    const delta = leftVector[valueIndex] - rightVector[valueIndex];
    if (delta < -0.000001) {
      return false;
    }
    if (delta > 0.000001) {
      strictlyGreater = true;
    }
  }
  return strictlyGreater || leftCardId < rightCardId;
}

export function pruneDominatedMedleySlotCards(slots: MedleySlotSearch[]): MedleySlotSearch[] {
  if (slots.length !== MEDLEY_TEAM_COUNT) {
    return slots;
  }

  const cardsById = new Map<number, SearchCard[]>();
  for (const slot of slots) {
    for (const card of slot.searchCards) {
      const records = cardsById.get(card.cardId) ?? [];
      records[slot.songIndex] = card;
      cardsById.set(card.cardId, records);
    }
  }

  const completeCardsById = [...cardsById.entries()]
    .filter((entry): entry is [number, SearchCard[]] => entry[1].filter(Boolean).length === MEDLEY_TEAM_COUNT);
  const entriesByCharacter = new Map<number, Array<[number, SearchCard[]]>>();
  for (const entry of completeCardsById) {
    const characterId = entry[1][0].characterId;
    const entries = entriesByCharacter.get(characterId) ?? [];
    entries.push(entry);
    entriesByCharacter.set(characterId, entries);
  }

  const removedCardIds = new Set<number>();
  for (const entries of entriesByCharacter.values()) {
    if (entries.length <= MEDLEY_TEAM_COUNT) {
      continue;
    }
    for (const [cardId, cards] of entries) {
      let isDominatedInEverySlot = true;
      for (let slotIndex = 0; slotIndex < MEDLEY_TEAM_COUNT; slotIndex += 1) {
        let dominatorCount = 0;
        for (const [otherCardId, otherCards] of entries) {
          if (otherCardId === cardId) {
            continue;
          }
          if (medleyCardDominatesInSlot(otherCardId, otherCards[slotIndex], cardId, cards[slotIndex])) {
            dominatorCount += 1;
            if (dominatorCount >= MEDLEY_TEAM_COUNT) {
              break;
            }
          }
        }
        if (dominatorCount < MEDLEY_TEAM_COUNT) {
          isDominatedInEverySlot = false;
          break;
        }
      }
      if (isDominatedInEverySlot) {
        removedCardIds.add(cardId);
      }
    }
  }

  if (removedCardIds.size === 0) {
    return slots;
  }

  return slots.map((slot) => {
    const searchCards = slot.searchCards.filter((card) => !removedCardIds.has(card.cardId));
    return rebuildMedleySlotWithSearchCards(slot, searchCards);
  });
}

export function getMedleyCharacterMask(
  slot: MedleySlotSearch,
  card: SearchCard,
): { low: number; high: number } | null {
  const characterIndex = slot.upperBoundIndex.characterIndexById.get(card.characterId);
  if (characterIndex === undefined) {
    return null;
  }
  if (characterIndex < CHARACTER_MASK_SEGMENT_BITS) {
    return {
      low: 1 << characterIndex,
      high: 0,
    };
  }
  return {
    low: 0,
    high: 1 << (characterIndex - CHARACTER_MASK_SEGMENT_BITS),
  };
}

export function estimateMedleyForcedCardScoreUpperBound(
  slots: MedleySlotSearch[],
  slotIndex: number,
  cardId: number,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): number {
  const slot = slots[slotIndex];
  const card = slot.searchCards.find((searchCard) => searchCard.cardId === cardId);
  if (!card) {
    return Number.NEGATIVE_INFINITY;
  }
  const characterMask = getMedleyCharacterMask(slot, card);
  if (!characterMask) {
    return Number.NEGATIVE_INFINITY;
  }
  const bannedCardIds = new Set<number>([cardId]);
  const forcedSlotUpperBound = estimateMedleySlotBranchScoreUpperBound(
    slot,
    [card],
    0,
    bannedCardIds,
    characterMask.low,
    characterMask.high,
    card.effectivePower,
    profiling,
    true,
  );
  if (!Number.isFinite(forcedSlotUpperBound)) {
    return Number.NEGATIVE_INFINITY;
  }
  const remainingSlotIndices = slots
    .map((_, index) => index)
    .filter((index) => index !== slotIndex);
  const remainingUpperBound = estimateMedleyRemainingScoreUpperBound(
    slots,
    remainingSlotIndices,
    bannedCardIds,
    profiling,
    true,
    true,
    false,
    false,
    false,
  );
  return Number.isFinite(remainingUpperBound)
    ? forcedSlotUpperBound + remainingUpperBound
    : Number.NEGATIVE_INFINITY;
}

export function pruneMedleyCardsByInclusionUpper(
  slots: MedleySlotSearch[],
  threshold: number,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  shouldStop?: () => boolean,
): MedleySlotSearch[] {
  if (slots.length !== MEDLEY_TEAM_COUNT || !Number.isFinite(threshold)) {
    return slots;
  }

  const cardIds = [...new Set(slots.flatMap((slot) => slot.searchCards.map((card) => card.cardId)))];
  const removedCardIds = new Set<number>();
  for (const cardId of cardIds) {
    if (shouldStop?.()) {
      break;
    }
    profiling.inclusionUpperAnalysisCount += 1;
    let forcedUpperBound = Number.NEGATIVE_INFINITY;
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      forcedUpperBound = Math.max(
        forcedUpperBound,
        estimateMedleyForcedCardScoreUpperBound(slots, slotIndex, cardId, profiling),
      );
    }
    if (forcedUpperBound < threshold) {
      removedCardIds.add(cardId);
    }
  }

  if (removedCardIds.size === 0) {
    return slots;
  }
  profiling.inclusionUpperPrunedCardCount += removedCardIds.size;
  return slots.map((slot) => {
    const searchCards = slot.searchCards.filter((card) => !removedCardIds.has(card.cardId));
    return rebuildMedleySlotWithSearchCards(slot, searchCards);
  });
}

export function rebuildMedleySlotWithSearchCards(slot: MedleySlotSearch, searchCards: SearchCard[]): MedleySlotSearch {
  const upperBoundIndex = buildCharacterUpperBoundIndex(searchCards);
  return {
    ...slot,
    searchCards,
    upperBoundIndex,
    rootScoreUpperBound: estimateSearchScopeScoreUpperBound(
      [],
      upperBoundIndex,
      searchCards,
      0,
      0,
      0,
      slot.baseScoreRatePerPower,
    ),
    teamEvaluationCache: new Map(),
  };
}

export function enumerateMedleySlotTeams(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  isPastDeadline: () => boolean,
  getMinimumScore: (selectedCards: SearchCard[]) => number,
  observeUpperBound: (upperBound: number) => void,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  onTeam: (candidate: MedleyTeamCandidate) => void,
  useContextualSkillUpper = false,
): void {
  const selectedCards: SearchCard[] = [];
  let selectedPower = 0;
  let usedCharacterMaskLow = 0;
  let usedCharacterMaskHigh = 0;

  const visit = (startIndex: number): void => {
    if (stats.timedOut || isPastDeadline()) {
      stats.isExhaustive = false;
      stats.timedOut = true;
      stats.searchMode = "bounded";
      return;
    }

    const remaining = 5 - selectedCards.length;
    if (remaining === 0) {
      stats.enumeratedTeamCount += 1;
      const cacheKey = getMedleyTeamEvaluationCacheKey(selectedCards);
      let result = slot.teamEvaluationCache.get(cacheKey);
      if (!slot.teamEvaluationCache.has(cacheKey)) {
        profiling.teamEvaluationCacheMissCount += 1;
        result = evaluateTeam({
          cards: selectedCards,
          input: slot.input,
          chart: slot.chart,
          configuration: slot.configuration,
          server,
          perfectRate,
          scoreCache: slot.scoreCache,
          comboOptions: slot.comboOptions,
        });
        slot.teamEvaluationCache.set(cacheKey, result);
        stats.evaluatedTeamCount += 1;
      } else {
        profiling.teamEvaluationCacheHitCount += 1;
      }
      if (result && result.score >= getMinimumScore(selectedCards)) {
        onTeam({
          result,
          cards: [...selectedCards],
          cardIds: selectedCards.map((card) => card.cardId),
        });
      }
      return;
    }

    if (slot.searchCards.length - startIndex < remaining) {
      return;
    }

    const minimumScore = getMinimumScore(selectedCards);
    const contextBranchScoreUpperBound = estimateSearchScopeScoreUpperBound(
      selectedCards,
      slot.upperBoundIndex,
      slot.searchCards,
      startIndex,
      usedCharacterMaskLow,
      usedCharacterMaskHigh,
      slot.baseScoreRatePerPower,
      undefined,
      selectedPower,
    );
    if (!Number.isFinite(contextBranchScoreUpperBound) || contextBranchScoreUpperBound < minimumScore) {
      stats.prunedBranchCount += 1;
      return;
    }
    const bannedAwareBranchScoreUpperBound = estimateMedleySlotBranchScoreUpperBound(
      slot,
      selectedCards,
      startIndex,
      bannedCardIds,
      usedCharacterMaskLow,
      usedCharacterMaskHigh,
      selectedPower,
      profiling,
      useContextualSkillUpper,
    );
    const branchScoreUpperBound = Math.min(contextBranchScoreUpperBound, bannedAwareBranchScoreUpperBound);
    if (!Number.isFinite(branchScoreUpperBound) || branchScoreUpperBound < minimumScore) {
      stats.prunedBranchCount += 1;
      return;
    }
    observeUpperBound(branchScoreUpperBound);

    for (let index = startIndex; index < slot.searchCards.length; index += 1) {
      const card = slot.searchCards[index];
      if (bannedCardIds.has(card.cardId)) {
        continue;
      }
      const characterIndex = slot.upperBoundIndex.characterIndexById.get(card.characterId);
      if (characterIndex === undefined || hasCharacterIndexInMask(usedCharacterMaskLow, usedCharacterMaskHigh, characterIndex)) {
        continue;
      }
      const isLowCharacterMask = characterIndex < CHARACTER_MASK_SEGMENT_BITS;
      const characterBit = isLowCharacterMask
        ? 1 << characterIndex
        : 1 << (characterIndex - CHARACTER_MASK_SEGMENT_BITS);

      selectedCards.push(card);
      selectedPower += card.effectivePower;
      if (isLowCharacterMask) {
        usedCharacterMaskLow |= characterBit;
      } else {
        usedCharacterMaskHigh |= characterBit;
      }
      visit(index + 1);
      if (isLowCharacterMask) {
        usedCharacterMaskLow &= ~characterBit;
      } else {
        usedCharacterMaskHigh &= ~characterBit;
      }
      selectedPower -= card.effectivePower;
      selectedCards.pop();
      if (stats.timedOut) {
        return;
      }
    }
  };

  visit(0);
}

export function findBestMedleySlotTeam(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  isPastDeadline: () => boolean,
  observeUpperBound: (upperBound: number) => void,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  minimumScore = Number.NEGATIVE_INFINITY,
  useContextualSkillUpper = false,
): MedleyTeamCandidate | null {
  let best: MedleyTeamCandidate | null = null;
  enumerateMedleySlotTeams(
    slot,
    bannedCardIds,
    server,
    perfectRate,
    stats,
    isPastDeadline,
    () => Math.max(best?.result.score ?? Number.NEGATIVE_INFINITY, minimumScore),
    observeUpperBound,
    profiling,
    (candidate) => {
      if (!best || candidate.result.score > best.result.score) {
        best = candidate;
      }
    },
    useContextualSkillUpper,
  );
  return best;
}

export function getMedleyBestSlotTeamCacheKey(slotIndex: number, bannedCardIds: Set<number>): string {
  return `${slotIndex}:${[...bannedCardIds].sort((left, right) => left - right).join(",")}`;
}

export function findBestMedleySlotTeamWithCache(
  cache: Map<string, MedleyBestSlotTeamCacheEntry>,
  slotIndex: number,
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  isPastDeadline: () => boolean,
  observeUpperBound: (upperBound: number) => void,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  minimumScore = Number.NEGATIVE_INFINITY,
  useContextualSkillUpper = false,
): MedleyTeamCandidate | null {
  const key = getMedleyBestSlotTeamCacheKey(slotIndex, bannedCardIds);
  const cached = cache.get(key);
  if (cached) {
    profiling.bestSlotTeamCacheHitCount += 1;
    return (cached.candidate?.result.score ?? Number.NEGATIVE_INFINITY) >= minimumScore
      ? cached.candidate
      : null;
  }
  profiling.bestSlotTeamCacheMissCount += 1;

  const shouldCache = !Number.isFinite(minimumScore);
  const candidate = findBestMedleySlotTeam(
    slot,
    bannedCardIds,
    server,
    perfectRate,
    stats,
    isPastDeadline,
    observeUpperBound,
    profiling,
    minimumScore,
    useContextualSkillUpper,
  );
  if (shouldCache && !stats.timedOut) {
    cache.set(key, { candidate });
  }
  return candidate;
}

export function estimateRelaxedMedleyRemainingBestScoreUpperBound(
  cache: Map<string, MedleyBestSlotTeamCacheEntry>,
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  isPastDeadline: () => boolean,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  useContextualSkillUpper = false,
): number {
  let upperBound = 0;
  for (const slotIndex of remainingSlotIndices) {
    const candidate = findBestMedleySlotTeamWithCache(
      cache,
      slotIndex,
      slots[slotIndex],
      bannedCardIds,
      server,
      perfectRate,
      stats,
      isPastDeadline,
      () => undefined,
      profiling,
      Number.NEGATIVE_INFINITY,
      useContextualSkillUpper,
    );
    if (stats.timedOut) {
      return Number.NEGATIVE_INFINITY;
    }
    if (!candidate) {
      return Number.NEGATIVE_INFINITY;
    }
    upperBound += candidate.result.score;
  }
  return upperBound;
}

export function buildMedleySlotSearches(
  input: BandoriMedleyTeamSearchInput,
  songInputs: BandoriMedleySongSearchInput[],
  calculatedCards: CalculatedBandoriCard[],
  configuration: BandoriAreaItemConfiguration,
  server: number,
  buildContexts?: MedleySlotBuildContext[],
): MedleySlotSearch[] {
  // Medley combo is sequential: slot N starts from the total note count of all previous slots.
  // The per-slot card/search-card construction still comes from shared single-search helpers.
  const contexts = buildContexts ?? buildMedleySlotBuildContexts(input, songInputs, calculatedCards, server);
  return contexts.map((context) => {
    const searchCards = sortSearchCardsForTraversal(
      buildSearchCardsForConfiguration(calculatedCards, context.input, configuration, server, context.skillRateProfiles),
      context.baseScoreRatePerPower,
    );
    const upperBoundIndex = buildCharacterUpperBoundIndex(searchCards);
    const rootScoreUpperBound = estimateSearchScopeScoreUpperBound(
      [],
      upperBoundIndex,
      searchCards,
      0,
      0,
      0,
      context.baseScoreRatePerPower,
    );
    const slot: MedleySlotSearch = {
      songIndex: context.songIndex,
      startCombo: context.startCombo,
      chart: context.chart,
      input: context.input,
      configuration,
      searchCards,
      upperBoundIndex,
      baseScoreRatePerPower: context.baseScoreRatePerPower,
      rootScoreUpperBound,
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
      comboOptions: context.comboOptions,
      teamEvaluationCache: new Map(),
    };
    return slot;
  });
}
