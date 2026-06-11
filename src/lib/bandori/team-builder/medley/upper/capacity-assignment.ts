/*
 * Remaining-slot capacity assignment dispatcher.
 *
 * DFS calls this module to combine the available capacity upper families and select the
 * tightest safe bound for the current remaining medley slots.
 */

import {
  MEDLEY_ENABLE_CARD_BOUND_DUAL_OBJECTIVE_UPPER,
  MEDLEY_ENABLE_CARD_MIN_COEFFICIENT_UPPER,
  MEDLEY_ENABLE_CARD_SPECIFIC_LAGRANGIAN_UPPER,
  MEDLEY_ENABLE_CONTEXT_BOUND_BUCKETED_JOINT_UPPER,
  MEDLEY_ENABLE_CONTEXT_BOUND_LAGRANGIAN_UPPER,
  MEDLEY_ENABLE_CONTEXT_BOUND_MCCORMICK_UPPER,
  MEDLEY_ENABLE_CONTEXT_FIXED_CARD_SPECIFIC_UPPER,
  MEDLEY_ENABLE_CONTEXT_GROUP_CARD_SPECIFIC_UPPER,
  MEDLEY_ENABLE_LEADER_FIXED_CARD_SPECIFIC_UPPER,
  MEDLEY_ENABLE_LEADER_GROUP_CARD_SPECIFIC_UPPER,
  MEDLEY_SKILL_COEFFICIENT_EPSILON,
  MEDLEY_TEAM_COUNT,
  MEDLEY_TEAM_SIZE,
} from "../constants";
import {
  estimateMedleyCapacityBucketedScoreUpperBound,
  estimateMedleyCapacityDualObjectiveScoreUpperBound,
  estimateMedleyCapacityParetoScoreUpperBound,
  getMedleyCapacityTransition,
} from "./capacity-core";
import {
  buildMedleyCardBoundPowerUpperBySlot,
  buildMedleyCardSpecificCoefficientUpperBySlot,
  estimateMedleyCapacityCardBoundBucketedJointScoreUpperBound,
  estimateMedleyCapacityCardBoundDualObjectiveScoreUpperBound,
  estimateMedleyCapacityCardBoundLagrangianScoreUpperBound,
  estimateMedleyCapacityCardBoundSharedPowerSkillScoreUpperBound,
  estimateMedleyCapacityCardBoundSkillAwareScoreUpperBound,
  estimateMedleyCapacityCardSpecificCoefficientScoreUpperBound,
  estimateMedleyCapacityCardSpecificLagrangianScoreUpperBound,
  estimateMedleySlotEffectivePowerUpperBound,
  estimateMedleySlotSkillCoefficient,
} from "./card-bound";
import { estimateMedleyCapacityCardMinCoefficientScoreUpperBound } from "./card-min";
import {
  estimateMedleyCapacityContextBoundBucketedJointScoreUpperBound,
  estimateMedleyCapacityContextBoundLagrangianScoreUpperBound,
  estimateMedleyCapacityContextBoundMcCormickScoreUpperBound,
  estimateMedleyCapacityContextFixedCardSpecificCoefficientScoreUpperBound,
  estimateMedleyCapacityContextGroupCardSpecificCoefficientScoreUpperBound,
  estimateMedleyCapacityLeaderFixedCardSpecificCoefficientScoreUpperBound,
  estimateMedleyCapacityLeaderGroupCardSpecificCoefficientScoreUpperBound,
} from "./context-bound";
import { buildMedleyCapacityCardsByCharacter } from "./common";
import {
  estimateMedleySlotBranchScoreUpperBound,
  getMedleyCardSkillAverageRateUpper,
  getMedleyCardSkillLeaderRateUpper,
} from "./skill-context";
import { calculateSkillScoreUpperBoundsForPower } from "@/lib/bandori/team-builder/core/scoring";
import type {
  BandoriMedleyTeamSearchProfilingStats,
  MedleyCapacityAssignmentScoreUpperBound,
  MedleyCapacityUpperMode,
  MedleySlotSearch,
} from "../types";
import type { SearchCard } from "@/lib/bandori/team-builder/core";

type MedleyTwoSlotCardBoundSkillScoreUpper = {
  averageScore: number;
  leaderScore: number;
  leaderTotalScore: number;
};

type MedleyTwoSlotCapacityCardRecord = {
  cardId: number;
  card0: SearchCard | null;
  card1: SearchCard | null;
  card0AverageRate: number;
  card1AverageRate: number;
  card0LeaderRate: number;
  card1LeaderRate: number;
};

type MedleyTwoSlotCapacityCharacterGroup = {
  records: MedleyTwoSlotCapacityCardRecord[];
};

type MedleyTwoSlotCapacityValueRecord = {
  cardId: number;
  value: number;
};

type MedleyTwoSlotCapacitySlotCharacterSummary = {
  characterId: number;
  powerRecords: MedleyTwoSlotCapacityValueRecord[];
  averageRateRecords: MedleyTwoSlotCapacityValueRecord[];
  leaderRateRecords: MedleyTwoSlotCapacityValueRecord[];
};

type MedleyTwoSlotCapacitySlotBounds = {
  powerUpperBound: number;
  leaderConstant: number;
  coefficientEstimate: ReturnType<typeof estimateMedleySlotSkillCoefficient>;
};

type MedleyTwoSlotCardBoundSlotContext = {
  slot: MedleySlotSearch;
  topCharacterPowers: Array<{ characterId: number; power: number }>;
};

type MedleyTwoSlotCardBoundTransitionRecord = {
  currentIndex: number;
  characterOptionIndex: number;
  nextIndex: number;
};

export type MedleyTwoSlotSharedPowerDualUpperEstimate = {
  upperBound: number;
  leaderPowerShare: number;
  lambdaBySlot: [number, number];
};

const MEDLEY_TWO_SLOT_SHARED_POWER_DUAL_LEADER_SHARES = [
  1 / 6,
  0.25,
  0.4,
] as const;
const MEDLEY_TWO_SLOT_SHARED_POWER_DUAL_LAMBDA_FRACTIONS = [
  0,
  0.125,
  0.25,
  0.375,
  0.5,
  0.625,
  0.75,
  0.875,
  1,
] as const;

const medleyTwoSlotCapacityGroupCache = new WeakMap<
  MedleySlotSearch,
  WeakMap<MedleySlotSearch, MedleyTwoSlotCapacityCharacterGroup[]>
>();
const medleyTwoSlotCapacitySlotSummaryCache = new WeakMap<
  MedleySlotSearch,
  MedleyTwoSlotCapacitySlotCharacterSummary[]
>();
let medleyTwoSlotCardBoundTransitionRecords: MedleyTwoSlotCardBoundTransitionRecord[] | null = null;
const medleyTwoSlotCardBoundSkillScoreUpperCache = new WeakMap<
  MedleySlotSearch,
  Map<string, MedleyTwoSlotCardBoundSkillScoreUpper>
>();

function getMedleyTwoSlotCardBoundTransitionRecords(): MedleyTwoSlotCardBoundTransitionRecord[] {
  if (medleyTwoSlotCardBoundTransitionRecords) {
    return medleyTwoSlotCardBoundTransitionRecords;
  }

  const transition = getMedleyCapacityTransition(2);
  const records: MedleyTwoSlotCardBoundTransitionRecord[] = [];
  for (let stateIndex = 0; stateIndex < transition.stateCount; stateIndex += 1) {
    for (let leaderMask = 0; leaderMask < 4; leaderMask += 1) {
      const currentIndex = stateIndex * 4 + leaderMask;
      for (let characterMask = 1; characterMask < 4; characterMask += 1) {
        const nextStateIndex = transition.nextIndexByMask[stateIndex * 4 + characterMask];
        if (nextStateIndex < 0) {
          continue;
        }
        for (let characterLeaderMask = 0; characterLeaderMask < 4; characterLeaderMask += 1) {
          if (
            (characterLeaderMask & ~characterMask) !== 0
            || (leaderMask & characterLeaderMask) !== 0
          ) {
            continue;
          }
          records.push({
            currentIndex,
            characterOptionIndex: characterMask * 4 + characterLeaderMask,
            nextIndex: nextStateIndex * 4 + (leaderMask | characterLeaderMask),
          });
        }
      }
    }
  }
  medleyTwoSlotCardBoundTransitionRecords = records;
  return records;
}

function insertDescendingTopValue(values: number[], value: number, limit: number): void {
  let index = 0;
  while (index < values.length && values[index] >= value) {
    index += 1;
  }
  if (index >= limit) {
    return;
  }
  values.splice(index, 0, value);
  if (values.length > limit) {
    values.length = limit;
  }
}

function insertDescendingTopCharacterRate(
  values: Array<{ characterId: number; value: number }>,
  characterId: number,
  value: number,
  limit: number,
): void {
  let index = 0;
  while (index < values.length && values[index].value >= value) {
    index += 1;
  }
  if (index >= limit) {
    return;
  }
  values.splice(index, 0, { characterId, value });
  if (values.length > limit) {
    values.length = limit;
  }
}

function getFirstUnbannedMedleyTwoSlotValue(
  records: MedleyTwoSlotCapacityValueRecord[],
  bannedCardIds: Set<number>,
): number {
  for (const record of records) {
    if (!bannedCardIds.has(record.cardId)) {
      return record.value;
    }
  }
  return Number.NEGATIVE_INFINITY;
}

function sumTopMedleyTwoSlotAverageRatesExcluding(
  topAverageRates: Array<{ characterId: number; value: number }>,
  excludedCharacterId: number,
): number {
  let sum = 0;
  let count = 0;
  for (const rate of topAverageRates) {
    if (rate.characterId === excludedCharacterId) {
      continue;
    }
    sum += rate.value;
    count += 1;
    if (count >= MEDLEY_TEAM_SIZE - 1) {
      break;
    }
  }
  return count >= MEDLEY_TEAM_SIZE - 1 ? sum : Number.NEGATIVE_INFINITY;
}

function getMedleyTwoSlotCapacitySlotSummary(
  slot: MedleySlotSearch,
): MedleyTwoSlotCapacitySlotCharacterSummary[] {
  const cached = medleyTwoSlotCapacitySlotSummaryCache.get(slot);
  if (cached) {
    return cached;
  }

  const recordsByCharacter = new Map<number, {
    powerRecords: MedleyTwoSlotCapacityValueRecord[];
    averageRateRecords: MedleyTwoSlotCapacityValueRecord[];
    leaderRateRecords: MedleyTwoSlotCapacityValueRecord[];
  }>();
  for (const card of slot.searchCards) {
    let records = recordsByCharacter.get(card.characterId);
    if (!records) {
      records = {
        powerRecords: [],
        averageRateRecords: [],
        leaderRateRecords: [],
      };
      recordsByCharacter.set(card.characterId, records);
    }
    records.powerRecords.push({ cardId: card.cardId, value: card.effectivePower });
    records.averageRateRecords.push({ cardId: card.cardId, value: getMedleyCardSkillAverageRateUpper(card) });
    records.leaderRateRecords.push({ cardId: card.cardId, value: getMedleyCardSkillLeaderRateUpper(card) });
  }

  const summary = [...recordsByCharacter.entries()].map(([characterId, records]) => {
    records.powerRecords.sort((left, right) => right.value - left.value);
    records.averageRateRecords.sort((left, right) => right.value - left.value);
    records.leaderRateRecords.sort((left, right) => right.value - left.value);
    return {
      characterId,
      powerRecords: records.powerRecords,
      averageRateRecords: records.averageRateRecords,
      leaderRateRecords: records.leaderRateRecords,
    };
  });
  medleyTwoSlotCapacitySlotSummaryCache.set(slot, summary);
  return summary;
}

function estimateMedleyTwoSlotCapacitySlotBounds(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
): MedleyTwoSlotCapacitySlotBounds {
  const topPowers: number[] = [];
  const topAverageRates: Array<{ characterId: number; value: number }> = [];
  const characterRates: Array<{ characterId: number; averageRate: number; leaderRate: number }> = [];
  let maxLeaderRate = 0;

  for (const characterSummary of getMedleyTwoSlotCapacitySlotSummary(slot)) {
    const power = getFirstUnbannedMedleyTwoSlotValue(characterSummary.powerRecords, bannedCardIds);
    const averageRate = getFirstUnbannedMedleyTwoSlotValue(characterSummary.averageRateRecords, bannedCardIds);
    const leaderRate = getFirstUnbannedMedleyTwoSlotValue(characterSummary.leaderRateRecords, bannedCardIds);
    if (!Number.isFinite(power) || !Number.isFinite(averageRate) || !Number.isFinite(leaderRate)) {
      continue;
    }
    insertDescendingTopValue(topPowers, power, MEDLEY_TEAM_SIZE);
    insertDescendingTopCharacterRate(topAverageRates, characterSummary.characterId, averageRate, MEDLEY_TEAM_SIZE);
    characterRates.push({
      characterId: characterSummary.characterId,
      averageRate,
      leaderRate,
    });
    maxLeaderRate = Math.max(maxLeaderRate, leaderRate);
  }

  if (topPowers.length < MEDLEY_TEAM_SIZE || characterRates.length < MEDLEY_TEAM_SIZE) {
    return {
      powerUpperBound: Number.NEGATIVE_INFINITY,
      leaderConstant: Number.NEGATIVE_INFINITY,
      coefficientEstimate: {
        coefficient: Number.NEGATIVE_INFINITY,
        legacyCoefficient: Number.NEGATIVE_INFINITY,
        improvement: 0,
      },
    };
  }

  const powerUpperBound = topPowers
    .slice(0, MEDLEY_TEAM_SIZE)
    .reduce((sum, power) => sum + power, 0);
  let bestCharacterDistinctSkillRate = Number.NEGATIVE_INFINITY;
  for (const rate of characterRates) {
    const topOtherAverageRates = sumTopMedleyTwoSlotAverageRatesExcluding(
      topAverageRates,
      rate.characterId,
    );
    if (!Number.isFinite(topOtherAverageRates)) {
      continue;
    }
    bestCharacterDistinctSkillRate = Math.max(
      bestCharacterDistinctSkillRate,
      rate.leaderRate + rate.averageRate + topOtherAverageRates,
    );
  }
  const coefficient = Number.isFinite(bestCharacterDistinctSkillRate)
    ? slot.baseScoreRatePerPower + bestCharacterDistinctSkillRate
    : Number.NEGATIVE_INFINITY;

  return {
    powerUpperBound,
    leaderConstant: powerUpperBound * maxLeaderRate,
    coefficientEstimate: {
      coefficient,
      legacyCoefficient: coefficient,
      improvement: 0,
    },
  };
}

function getMedleyTwoSlotCapacityCharacterGroups(
  firstSlot: MedleySlotSearch,
  secondSlot: MedleySlotSearch,
): MedleyTwoSlotCapacityCharacterGroup[] {
  const cachedBySecondSlot = medleyTwoSlotCapacityGroupCache.get(firstSlot);
  const cached = cachedBySecondSlot?.get(secondSlot);
  if (cached) {
    return cached;
  }

  const recordsByCharacter = new Map<number, Map<number, MedleyTwoSlotCapacityCardRecord>>();
  const addCard = (card: SearchCard, slotPosition: 0 | 1): void => {
    let recordsByCardId = recordsByCharacter.get(card.characterId);
    if (!recordsByCardId) {
      recordsByCardId = new Map<number, MedleyTwoSlotCapacityCardRecord>();
      recordsByCharacter.set(card.characterId, recordsByCardId);
    }
    let record = recordsByCardId.get(card.cardId);
    if (!record) {
      record = {
        cardId: card.cardId,
        card0: null,
        card1: null,
        card0AverageRate: 0,
        card1AverageRate: 0,
        card0LeaderRate: 0,
        card1LeaderRate: 0,
      };
      recordsByCardId.set(card.cardId, record);
    }
    if (slotPosition === 0) {
      record.card0 = card;
      record.card0AverageRate = getMedleyCardSkillAverageRateUpper(card);
      record.card0LeaderRate = getMedleyCardSkillLeaderRateUpper(card);
    } else {
      record.card1 = card;
      record.card1AverageRate = getMedleyCardSkillAverageRateUpper(card);
      record.card1LeaderRate = getMedleyCardSkillLeaderRateUpper(card);
    }
  };

  for (const card of firstSlot.searchCards) {
    addCard(card, 0);
  }
  for (const card of secondSlot.searchCards) {
    addCard(card, 1);
  }

  const groups = [...recordsByCharacter.values()].map((recordsByCardId) => ({
    records: [...recordsByCardId.values()],
  }));
  const nextCachedBySecondSlot = cachedBySecondSlot ?? new WeakMap<MedleySlotSearch, MedleyTwoSlotCapacityCharacterGroup[]>();
  nextCachedBySecondSlot.set(secondSlot, groups);
  if (!cachedBySecondSlot) {
    medleyTwoSlotCapacityGroupCache.set(firstSlot, nextCachedBySecondSlot);
  }
  return groups;
}

function buildMedleyTwoSlotCardBoundSlotContext(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
): MedleyTwoSlotCardBoundSlotContext {
  const topCharacterPowers: Array<{ characterId: number; power: number }> = [];
  for (const characterSummary of getMedleyTwoSlotCapacitySlotSummary(slot)) {
    const power = getFirstUnbannedMedleyTwoSlotValue(characterSummary.powerRecords, bannedCardIds);
    if (!Number.isFinite(power)) {
      continue;
    }
    let index = 0;
    while (index < topCharacterPowers.length && topCharacterPowers[index].power >= power) {
      index += 1;
    }
    if (index >= MEDLEY_TEAM_SIZE) {
      continue;
    }
    topCharacterPowers.splice(index, 0, { characterId: characterSummary.characterId, power });
    if (topCharacterPowers.length > MEDLEY_TEAM_SIZE) {
      topCharacterPowers.length = MEDLEY_TEAM_SIZE;
    }
  }
  return { slot, topCharacterPowers };
}

function getMedleyTwoSlotCardBoundTopOtherPowerSum(
  context: MedleyTwoSlotCardBoundSlotContext,
  excludedCharacterId: number,
): number {
  let sum = 0;
  let count = 0;
  for (const entry of context.topCharacterPowers) {
    if (entry.characterId === excludedCharacterId) {
      continue;
    }
    sum += entry.power;
    count += 1;
    if (count >= MEDLEY_TEAM_SIZE - 1) {
      break;
    }
  }
  return count >= MEDLEY_TEAM_SIZE - 1 ? sum : Number.NEGATIVE_INFINITY;
}

function estimateMedleyTwoSlotCardBoundSkillScores(
  context: MedleyTwoSlotCardBoundSlotContext,
  card: SearchCard,
  bandPowerUpper: number,
  averageRate: number,
  leaderRate: number,
): MedleyTwoSlotCardBoundSkillScoreUpper {
  const roundedBandPowerUpper = Math.floor(Math.max(0, bandPowerUpper));
  const cacheKey = `${card.skillSearchSignature}:${roundedBandPowerUpper}`;
  let slotCache = medleyTwoSlotCardBoundSkillScoreUpperCache.get(context.slot);
  if (!slotCache) {
    slotCache = new Map();
    medleyTwoSlotCardBoundSkillScoreUpperCache.set(context.slot, slotCache);
  }
  const cached = slotCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const floorAwareScoreUpper = calculateSkillScoreUpperBoundsForPower(
    context.slot.chart,
    context.slot.input.skillsById[String(card.skillId)],
    card.skillLevel,
    context.slot.input.server ?? 0,
    roundedBandPowerUpper,
    context.slot.comboOptions,
  );
  const continuousAverageScore = bandPowerUpper * averageRate;
  const continuousLeaderScore = bandPowerUpper * leaderRate;
  const averageScore = Math.min(continuousAverageScore, floorAwareScoreUpper.averageScore);
  const leaderScore = Math.min(continuousLeaderScore, floorAwareScoreUpper.leaderScore);
  const scoreUpper = {
    averageScore,
    leaderScore,
    leaderTotalScore: Math.min(
      averageScore + leaderScore,
      continuousAverageScore + continuousLeaderScore,
      floorAwareScoreUpper.averageScore + floorAwareScoreUpper.leaderScore,
    ),
  };
  slotCache.set(cacheKey, scoreUpper);
  return scoreUpper;
}

function addMedleyTwoSlotCardBoundOption(
  characterOptions: Float64Array,
  nextCharacterOptions: Float64Array,
  slotPosition: 0 | 1,
  context: MedleyTwoSlotCardBoundSlotContext,
  card: SearchCard | null,
  averageRate: number,
  leaderRate: number,
  bannedCardIds: Set<number>,
): void {
  if (!card || bannedCardIds.has(card.cardId)) {
    return;
  }

  const topOtherPowerSum = getMedleyTwoSlotCardBoundTopOtherPowerSum(
    context,
    card.characterId,
  );
  if (!Number.isFinite(topOtherPowerSum)) {
    return;
  }

  const cardBoundPowerUpper = card.effectivePower + topOtherPowerSum;
  const skillScores = estimateMedleyTwoSlotCardBoundSkillScores(
    context,
    card,
    cardBoundPowerUpper,
    averageRate,
    leaderRate,
  );
  const slotBit = 1 << slotPosition;
  const baseContribution = card.effectivePower * context.slot.baseScoreRatePerPower;
  for (let mask = 0; mask < 4; mask += 1) {
    if ((mask & slotBit) !== 0) {
      continue;
    }
    const nextMask = mask | slotBit;
    for (let leaderMask = 0; leaderMask < 4; leaderMask += 1) {
      const currentValue = characterOptions[mask * 4 + leaderMask];
      if (!Number.isFinite(currentValue)) {
        continue;
      }

      const averageIndex = nextMask * 4 + leaderMask;
      nextCharacterOptions[averageIndex] = Math.max(
        nextCharacterOptions[averageIndex],
        currentValue + baseContribution + skillScores.averageScore,
      );

      if ((leaderMask & slotBit) === 0) {
        const leaderIndex = nextMask * 4 + (leaderMask | slotBit);
        nextCharacterOptions[leaderIndex] = Math.max(
          nextCharacterOptions[leaderIndex],
          currentValue + baseContribution + skillScores.leaderTotalScore,
        );
      }
    }
  }
}

function computeMedleyTwoSlotCardBoundCharacterOptions(
  group: MedleyTwoSlotCapacityCharacterGroup,
  slotContexts: [MedleyTwoSlotCardBoundSlotContext, MedleyTwoSlotCardBoundSlotContext],
  bannedCardIds: Set<number>,
  characterOptionsScratch: Float64Array,
  nextCharacterOptionsScratch: Float64Array,
): Float64Array {
  let characterOptions = characterOptionsScratch;
  characterOptions.fill(Number.NEGATIVE_INFINITY);
  characterOptions[0] = 0;
  let nextCharacterOptions = nextCharacterOptionsScratch;

  for (const record of group.records) {
    nextCharacterOptions.set(characterOptions);
    addMedleyTwoSlotCardBoundOption(
      characterOptions,
      nextCharacterOptions,
      0,
      slotContexts[0],
      record.card0,
      record.card0AverageRate,
      record.card0LeaderRate,
      bannedCardIds,
    );
    addMedleyTwoSlotCardBoundOption(
      characterOptions,
      nextCharacterOptions,
      1,
      slotContexts[1],
      record.card1,
      record.card1AverageRate,
      record.card1LeaderRate,
      bannedCardIds,
    );
    const previousCharacterOptions = characterOptions;
    characterOptions = nextCharacterOptions;
    nextCharacterOptions = previousCharacterOptions;
  }

  return characterOptions;
}

function estimateMedleyFastTwoSlotCardBoundSkillAwareScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  if (profiling) {
    profiling.capacityCardBoundUpperCallCount += 1;
  }
  if (remainingSlotIndices.length !== 2) {
    if (profiling) {
      profiling.capacityCardBoundUpperSkippedCount += 1;
    }
    return null;
  }

  const remainingSlots = remainingSlotIndices.map((slotIndex) => slots[slotIndex]);
  const slotContexts = remainingSlots.map((slot) => (
    buildMedleyTwoSlotCardBoundSlotContext(slot, bannedCardIds)
  )) as [MedleyTwoSlotCardBoundSlotContext, MedleyTwoSlotCardBoundSlotContext];
  const groups = getMedleyTwoSlotCapacityCharacterGroups(remainingSlots[0], remainingSlots[1]);
  const transition = getMedleyCapacityTransition(2);
  let states = new Float64Array(transition.stateCount * 4);
  states.fill(Number.NEGATIVE_INFINITY);
  states[0] = 0;
  let nextStates = new Float64Array(transition.stateCount * 4);
  const characterOptionsScratch = new Float64Array(16);
  const nextCharacterOptionsScratch = new Float64Array(16);
  const transitionRecords = getMedleyTwoSlotCardBoundTransitionRecords();

  for (const group of groups) {
    const characterOptions = computeMedleyTwoSlotCardBoundCharacterOptions(
      group,
      slotContexts,
      bannedCardIds,
      characterOptionsScratch,
      nextCharacterOptionsScratch,
    );

    nextStates.set(states);
    for (const transitionRecord of transitionRecords) {
      const currentValue = states[transitionRecord.currentIndex];
      if (!Number.isFinite(currentValue)) {
        continue;
      }
      const characterValue = characterOptions[transitionRecord.characterOptionIndex];
      if (!Number.isFinite(characterValue)) {
        continue;
      }
      nextStates[transitionRecord.nextIndex] = Math.max(
        nextStates[transitionRecord.nextIndex],
        currentValue + characterValue,
      );
    }
    const previousStates = states;
    states = nextStates;
    nextStates = previousStates;
  }

  if (profiling) {
    profiling.capacityCardBoundUpperCompletedCount += 1;
  }
  return states[transition.targetIndex * 4 + 3];
}

function estimateMedleyFastTwoSlotCapacityAssignmentScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): MedleyCapacityAssignmentScoreUpperBound {
  const cardBoundUpperBound = estimateMedleyFastTwoSlotCardBoundSkillAwareScoreUpperBound(
    slots,
    remainingSlotIndices,
    bannedCardIds,
    profiling,
  );
  if (
    cardBoundUpperBound !== null
    && Number.isFinite(cardBoundUpperBound)
  ) {
    return {
      upperBound: cardBoundUpperBound,
      coefficientUpperBound: cardBoundUpperBound,
      skillAwareUpperBound: cardBoundUpperBound,
      paretoUpperBound: null,
      mode: "card-bound-skill-aware",
    };
  }
  return estimateMedleyBasicTwoSlotCapacityAssignmentScoreUpperBound(
    slots,
    remainingSlotIndices,
    bannedCardIds,
    profiling,
  );
}

function estimateMedleySharedPowerDualSkillSlack(
  skillRate: number,
  skillScoreCapAtPowerUpper: number,
  powerUpper: number,
  powerPenalty: number,
): number {
  if (
    !Number.isFinite(skillRate)
    || !Number.isFinite(skillScoreCapAtPowerUpper)
    || !Number.isFinite(powerUpper)
    || skillRate <= 0
    || skillScoreCapAtPowerUpper <= 0
    || powerUpper <= 0
  ) {
    return 0;
  }
  if (powerPenalty >= skillRate) {
    return 0;
  }
  const cappedPower = skillScoreCapAtPowerUpper / skillRate;
  if (Number.isFinite(cappedPower) && cappedPower <= powerUpper) {
    return Math.max(0, skillScoreCapAtPowerUpper - powerPenalty * cappedPower);
  }
  return Math.max(0, (skillRate - powerPenalty) * powerUpper);
}

function buildMedleyTwoSlotSharedPowerDualLambdaCandidates(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
  averagePowerShare: number,
  leaderPowerShare: number,
): number[] {
  let maxLambda = 0;
  for (const card of slot.searchCards) {
    if (bannedCardIds.has(card.cardId)) {
      continue;
    }
    if (averagePowerShare > 0) {
      maxLambda = Math.max(maxLambda, getMedleyCardSkillAverageRateUpper(card) / averagePowerShare);
    }
    if (leaderPowerShare > 0) {
      maxLambda = Math.max(maxLambda, getMedleyCardSkillLeaderRateUpper(card) / leaderPowerShare);
    }
  }
  if (!Number.isFinite(maxLambda) || maxLambda <= 0) {
    return [0];
  }
  return [...new Set(MEDLEY_TWO_SLOT_SHARED_POWER_DUAL_LAMBDA_FRACTIONS.map((fraction) => (
    maxLambda * fraction
  )))].sort((left, right) => left - right);
}

function addMedleyTwoSlotSharedPowerDualOption(
  characterOptions: Float64Array,
  nextCharacterOptions: Float64Array,
  slotPosition: 0 | 1,
  context: MedleyTwoSlotCardBoundSlotContext,
  card: SearchCard | null,
  averageRate: number,
  leaderRate: number,
  bannedCardIds: Set<number>,
  lambda: number,
  averagePowerShare: number,
  leaderPowerShare: number,
): void {
  if (!card || bannedCardIds.has(card.cardId)) {
    return;
  }

  const topOtherPowerSum = getMedleyTwoSlotCardBoundTopOtherPowerSum(
    context,
    card.characterId,
  );
  if (!Number.isFinite(topOtherPowerSum)) {
    return;
  }

  const cardBoundPowerUpper = card.effectivePower + topOtherPowerSum;
  const skillScores = estimateMedleyTwoSlotCardBoundSkillScores(
    context,
    card,
    cardBoundPowerUpper,
    averageRate,
    leaderRate,
  );
  const averageSlack = estimateMedleySharedPowerDualSkillSlack(
    averageRate,
    skillScores.averageScore,
    cardBoundPowerUpper,
    averagePowerShare * lambda,
  );
  const leaderSlack = estimateMedleySharedPowerDualSkillSlack(
    leaderRate,
    skillScores.leaderScore,
    cardBoundPowerUpper,
    leaderPowerShare * lambda,
  );
  const slotBit = 1 << slotPosition;
  const baseContribution = card.effectivePower * (context.slot.baseScoreRatePerPower + lambda);
  const averageContribution = baseContribution + averageSlack;
  for (let mask = 0; mask < 4; mask += 1) {
    if ((mask & slotBit) !== 0) {
      continue;
    }
    const nextMask = mask | slotBit;
    for (let leaderMask = 0; leaderMask < 4; leaderMask += 1) {
      const currentValue = characterOptions[mask * 4 + leaderMask];
      if (!Number.isFinite(currentValue)) {
        continue;
      }

      const averageIndex = nextMask * 4 + leaderMask;
      nextCharacterOptions[averageIndex] = Math.max(
        nextCharacterOptions[averageIndex],
        currentValue + averageContribution,
      );

      if ((leaderMask & slotBit) === 0) {
        const leaderIndex = nextMask * 4 + (leaderMask | slotBit);
        nextCharacterOptions[leaderIndex] = Math.max(
          nextCharacterOptions[leaderIndex],
          currentValue + averageContribution + leaderSlack,
        );
      }
    }
  }
}

function computeMedleyTwoSlotSharedPowerDualCharacterOptions(
  group: MedleyTwoSlotCapacityCharacterGroup,
  slotContexts: [MedleyTwoSlotCardBoundSlotContext, MedleyTwoSlotCardBoundSlotContext],
  bannedCardIds: Set<number>,
  lambdaBySlot: [number, number],
  averagePowerShare: number,
  leaderPowerShare: number,
  characterOptionsScratch: Float64Array,
  nextCharacterOptionsScratch: Float64Array,
): Float64Array {
  let characterOptions = characterOptionsScratch;
  characterOptions.fill(Number.NEGATIVE_INFINITY);
  characterOptions[0] = 0;
  let nextCharacterOptions = nextCharacterOptionsScratch;

  for (const record of group.records) {
    nextCharacterOptions.set(characterOptions);
    addMedleyTwoSlotSharedPowerDualOption(
      characterOptions,
      nextCharacterOptions,
      0,
      slotContexts[0],
      record.card0,
      record.card0AverageRate,
      record.card0LeaderRate,
      bannedCardIds,
      lambdaBySlot[0],
      averagePowerShare,
      leaderPowerShare,
    );
    addMedleyTwoSlotSharedPowerDualOption(
      characterOptions,
      nextCharacterOptions,
      1,
      slotContexts[1],
      record.card1,
      record.card1AverageRate,
      record.card1LeaderRate,
      bannedCardIds,
      lambdaBySlot[1],
      averagePowerShare,
      leaderPowerShare,
    );
    const previousCharacterOptions = characterOptions;
    characterOptions = nextCharacterOptions;
    nextCharacterOptions = previousCharacterOptions;
  }

  return characterOptions;
}

function estimateMedleyFastTwoSlotSharedPowerDualForParameters(
  groups: MedleyTwoSlotCapacityCharacterGroup[],
  slotContexts: [MedleyTwoSlotCardBoundSlotContext, MedleyTwoSlotCardBoundSlotContext],
  bannedCardIds: Set<number>,
  lambdaBySlot: [number, number],
  averagePowerShare: number,
  leaderPowerShare: number,
): number {
  const transition = getMedleyCapacityTransition(2);
  let states = new Float64Array(transition.stateCount * 4);
  states.fill(Number.NEGATIVE_INFINITY);
  states[0] = 0;
  let nextStates = new Float64Array(transition.stateCount * 4);
  const characterOptionsScratch = new Float64Array(16);
  const nextCharacterOptionsScratch = new Float64Array(16);
  const transitionRecords = getMedleyTwoSlotCardBoundTransitionRecords();

  for (const group of groups) {
    const characterOptions = computeMedleyTwoSlotSharedPowerDualCharacterOptions(
      group,
      slotContexts,
      bannedCardIds,
      lambdaBySlot,
      averagePowerShare,
      leaderPowerShare,
      characterOptionsScratch,
      nextCharacterOptionsScratch,
    );

    nextStates.set(states);
    for (const transitionRecord of transitionRecords) {
      const currentValue = states[transitionRecord.currentIndex];
      if (!Number.isFinite(currentValue)) {
        continue;
      }
      const characterValue = characterOptions[transitionRecord.characterOptionIndex];
      if (!Number.isFinite(characterValue)) {
        continue;
      }
      nextStates[transitionRecord.nextIndex] = Math.max(
        nextStates[transitionRecord.nextIndex],
        currentValue + characterValue,
      );
    }
    const previousStates = states;
    states = nextStates;
    nextStates = previousStates;
  }

  return states[transition.targetIndex * 4 + 3];
}

export function estimateMedleyFastTwoSlotSharedPowerDualScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
): MedleyTwoSlotSharedPowerDualUpperEstimate | null {
  if (remainingSlotIndices.length !== 2) {
    return null;
  }

  const remainingSlots = remainingSlotIndices.map((slotIndex) => slots[slotIndex]);
  const slotContexts = remainingSlots.map((slot) => (
    buildMedleyTwoSlotCardBoundSlotContext(slot, bannedCardIds)
  )) as [MedleyTwoSlotCardBoundSlotContext, MedleyTwoSlotCardBoundSlotContext];
  const groups = getMedleyTwoSlotCapacityCharacterGroups(remainingSlots[0], remainingSlots[1]);
  let bestEstimate: MedleyTwoSlotSharedPowerDualUpperEstimate | null = null;

  for (const leaderPowerShare of MEDLEY_TWO_SLOT_SHARED_POWER_DUAL_LEADER_SHARES) {
    const averagePowerShare = (1 - leaderPowerShare) / MEDLEY_TEAM_SIZE;
    if (averagePowerShare <= 0) {
      continue;
    }
    const lambdaCandidatesBySlot = remainingSlots.map((slot) => (
      buildMedleyTwoSlotSharedPowerDualLambdaCandidates(
        slot,
        bannedCardIds,
        averagePowerShare,
        leaderPowerShare,
      )
    )) as [number[], number[]];
    for (const lambda0 of lambdaCandidatesBySlot[0]) {
      for (const lambda1 of lambdaCandidatesBySlot[1]) {
        const lambdaBySlot: [number, number] = [lambda0, lambda1];
        const upperBound = estimateMedleyFastTwoSlotSharedPowerDualForParameters(
          groups,
          slotContexts,
          bannedCardIds,
          lambdaBySlot,
          averagePowerShare,
          leaderPowerShare,
        );
        if (
          Number.isFinite(upperBound)
          && (!bestEstimate || upperBound < bestEstimate.upperBound)
        ) {
          bestEstimate = {
            upperBound,
            leaderPowerShare,
            lambdaBySlot,
          };
        }
      }
    }
  }

  return bestEstimate;
}

function observeMedleySlotCoefficientEstimates(
  slotCoefficientEstimates: ReturnType<typeof estimateMedleySlotSkillCoefficient>[],
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): void {
  if (!profiling) {
    return;
  }
  profiling.capacityCoefficientTighteningCallCount += 1;
  for (const estimate of slotCoefficientEstimates) {
    if (Number.isFinite(estimate.improvement) && estimate.improvement > MEDLEY_SKILL_COEFFICIENT_EPSILON) {
      profiling.capacityCoefficientTighteningSlotImprovementCount += 1;
      profiling.capacityCoefficientTighteningSlotImprovementTotal += estimate.improvement;
      profiling.bestCapacityCoefficientTighteningSlotImprovement = Math.max(
        profiling.bestCapacityCoefficientTighteningSlotImprovement,
        estimate.improvement,
      );
    }
  }
}

function estimateMedleyBasicTwoSlotCapacityAssignmentScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): MedleyCapacityAssignmentScoreUpperBound {
  const remainingSlots = remainingSlotIndices.map((slotIndex) => slots[slotIndex]);
  const slotBounds = remainingSlots.map((slot) => estimateMedleyTwoSlotCapacitySlotBounds(slot, bannedCardIds));
  const slotPowerUpperBounds = slotBounds.map((bounds) => bounds.powerUpperBound);
  if (slotPowerUpperBounds.some((powerUpperBound) => !Number.isFinite(powerUpperBound))) {
    return {
      upperBound: Number.NEGATIVE_INFINITY,
      coefficientUpperBound: Number.NEGATIVE_INFINITY,
      skillAwareUpperBound: Number.NEGATIVE_INFINITY,
      paretoUpperBound: null,
      mode: "skill-aware",
    };
  }

  const slotLeaderConstants = slotBounds.map((bounds) => bounds.leaderConstant);
  const slotCoefficientEstimates = slotBounds.map((bounds) => bounds.coefficientEstimate);
  observeMedleySlotCoefficientEstimates(slotCoefficientEstimates, profiling);
  const slotCoefficients = slotCoefficientEstimates.map((estimate) => estimate.coefficient);
  if (slotCoefficients.some((coefficient) => !Number.isFinite(coefficient))) {
    return {
      upperBound: Number.NEGATIVE_INFINITY,
      coefficientUpperBound: Number.NEGATIVE_INFINITY,
      skillAwareUpperBound: Number.NEGATIVE_INFINITY,
      paretoUpperBound: null,
      mode: "skill-aware",
    };
  }

  const groups = getMedleyTwoSlotCapacityCharacterGroups(remainingSlots[0], remainingSlots[1]);
  const transition = getMedleyCapacityTransition(2);
  let coefficientStates = new Float64Array(transition.stateCount);
  coefficientStates.fill(Number.NEGATIVE_INFINITY);
  coefficientStates[0] = 0;
  let nextCoefficientStates = new Float64Array(transition.stateCount);
  let skillAwareStates = new Float64Array(transition.stateCount);
  skillAwareStates.fill(Number.NEGATIVE_INFINITY);
  skillAwareStates[0] = 0;
  let nextSkillAwareStates = new Float64Array(transition.stateCount);
  const characterCoefficientValues = new Float64Array(4);
  const characterSkillAwareValues = new Float64Array(4);

  for (const group of groups) {
    characterCoefficientValues.fill(Number.NEGATIVE_INFINITY);
    characterCoefficientValues[0] = 0;
    characterSkillAwareValues.fill(Number.NEGATIVE_INFINITY);
    characterSkillAwareValues[0] = 0;

    for (const record of group.records) {
      if (bannedCardIds.has(record.cardId)) {
        continue;
      }

      const coefficient0 = characterCoefficientValues[0];
      const coefficient1 = characterCoefficientValues[1];
      const coefficient2 = characterCoefficientValues[2];
      const skillAware0 = characterSkillAwareValues[0];
      const skillAware1 = characterSkillAwareValues[1];
      const skillAware2 = characterSkillAwareValues[2];
      if (record.card0) {
        const coefficientValue = record.card0.effectivePower * slotCoefficients[0];
        const skillAwareValue = (
          record.card0.effectivePower * remainingSlots[0].baseScoreRatePerPower
          + slotPowerUpperBounds[0] * record.card0AverageRate
        );
        if (Number.isFinite(coefficient0)) {
          characterCoefficientValues[1] = Math.max(characterCoefficientValues[1], coefficient0 + coefficientValue);
        }
        if (Number.isFinite(coefficient2)) {
          characterCoefficientValues[3] = Math.max(characterCoefficientValues[3], coefficient2 + coefficientValue);
        }
        if (Number.isFinite(skillAware0)) {
          characterSkillAwareValues[1] = Math.max(characterSkillAwareValues[1], skillAware0 + skillAwareValue);
        }
        if (Number.isFinite(skillAware2)) {
          characterSkillAwareValues[3] = Math.max(characterSkillAwareValues[3], skillAware2 + skillAwareValue);
        }
      }
      if (record.card1) {
        const coefficientValue = record.card1.effectivePower * slotCoefficients[1];
        const skillAwareValue = (
          record.card1.effectivePower * remainingSlots[1].baseScoreRatePerPower
          + slotPowerUpperBounds[1] * record.card1AverageRate
        );
        if (Number.isFinite(coefficient0)) {
          characterCoefficientValues[2] = Math.max(characterCoefficientValues[2], coefficient0 + coefficientValue);
        }
        if (Number.isFinite(coefficient1)) {
          characterCoefficientValues[3] = Math.max(characterCoefficientValues[3], coefficient1 + coefficientValue);
        }
        if (Number.isFinite(skillAware0)) {
          characterSkillAwareValues[2] = Math.max(characterSkillAwareValues[2], skillAware0 + skillAwareValue);
        }
        if (Number.isFinite(skillAware1)) {
          characterSkillAwareValues[3] = Math.max(characterSkillAwareValues[3], skillAware1 + skillAwareValue);
        }
      }
    }

    nextCoefficientStates.set(coefficientStates);
    nextSkillAwareStates.set(skillAwareStates);
    for (let stateIndex = 0; stateIndex < coefficientStates.length; stateIndex += 1) {
      const currentCoefficientValue = coefficientStates[stateIndex];
      const currentSkillAwareValue = skillAwareStates[stateIndex];
      for (let mask = 1; mask < 4; mask += 1) {
        const nextIndex = transition.nextIndexByMask[stateIndex * 4 + mask];
        if (nextIndex < 0) {
          continue;
        }
        const coefficientValue = characterCoefficientValues[mask];
        if (Number.isFinite(currentCoefficientValue) && Number.isFinite(coefficientValue)) {
          nextCoefficientStates[nextIndex] = Math.max(
            nextCoefficientStates[nextIndex],
            currentCoefficientValue + coefficientValue,
          );
        }
        const skillAwareValue = characterSkillAwareValues[mask];
        if (Number.isFinite(currentSkillAwareValue) && Number.isFinite(skillAwareValue)) {
          nextSkillAwareStates[nextIndex] = Math.max(
            nextSkillAwareStates[nextIndex],
            currentSkillAwareValue + skillAwareValue,
          );
        }
      }
    }
    const previousCoefficientStates = coefficientStates;
    coefficientStates = nextCoefficientStates;
    nextCoefficientStates = previousCoefficientStates;
    const previousSkillAwareStates = skillAwareStates;
    skillAwareStates = nextSkillAwareStates;
    nextSkillAwareStates = previousSkillAwareStates;
  }

  const coefficientUpperBound = coefficientStates[transition.targetIndex];
  const skillAwareUpperBound = skillAwareStates[transition.targetIndex]
    + slotLeaderConstants.reduce((sum, value) => sum + value, 0);
  const useSkillAwareBound = skillAwareUpperBound < coefficientUpperBound;
  return {
    upperBound: useSkillAwareBound ? skillAwareUpperBound : coefficientUpperBound,
    coefficientUpperBound,
    skillAwareUpperBound,
    paretoUpperBound: null,
    mode: useSkillAwareBound ? "skill-aware" : "coefficient",
  };
}

// Assign cards to relaxed per-slot capacity states. The relaxation allows one character bucket
// to contribute independently across remaining slots, so the result can be loose but must stay
// above every feasible disjoint medley completion.
export function estimateMedleyCapacityAssignmentScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
  useSkillAwareUpper = false,
  useParetoUpper = false,
  useBucketedUpper = false,
  enableTeamSharedCoefficientUpper = false,
  enableSharedPowerSkillUpper = false,
  useBasicSkillAwareOnly = false,
): MedleyCapacityAssignmentScoreUpperBound {
  if (remainingSlotIndices.length === 0) {
    return {
      upperBound: 0,
      coefficientUpperBound: 0,
      skillAwareUpperBound: null,
      paretoUpperBound: null,
      mode: "coefficient",
    };
  }

  if (useSkillAwareUpper && useBasicSkillAwareOnly && remainingSlotIndices.length === 2) {
    return estimateMedleyBasicTwoSlotCapacityAssignmentScoreUpperBound(
      slots,
      remainingSlotIndices,
      bannedCardIds,
      profiling,
    );
  }

  if (
    useSkillAwareUpper
    && remainingSlotIndices.length === 2
    && !useParetoUpper
    && !useBucketedUpper
    && !enableTeamSharedCoefficientUpper
  ) {
    return estimateMedleyFastTwoSlotCapacityAssignmentScoreUpperBound(
      slots,
      remainingSlotIndices,
      bannedCardIds,
      profiling,
    );
  }

  const usesPowerUpperBounds = useSkillAwareUpper || useBucketedUpper;
  const slotPowerUpperBounds = usesPowerUpperBounds
    ? remainingSlotIndices.map((slotIndex) => estimateMedleySlotEffectivePowerUpperBound(slots[slotIndex], bannedCardIds))
    : [];
  if (usesPowerUpperBounds && slotPowerUpperBounds.some((powerUpperBound) => !Number.isFinite(powerUpperBound))) {
    return {
      upperBound: Number.NEGATIVE_INFINITY,
      coefficientUpperBound: Number.NEGATIVE_INFINITY,
      skillAwareUpperBound: Number.NEGATIVE_INFINITY,
      paretoUpperBound: null,
      mode: "skill-aware",
    };
  }

  const slotLeaderConstants = useSkillAwareUpper
    ? remainingSlotIndices.map((slotIndex, slotPosition) => {
      const slot = slots[slotIndex];
      let leaderRate = 0;
      for (const card of slot.searchCards) {
        if (!bannedCardIds.has(card.cardId)) {
          leaderRate = Math.max(leaderRate, getMedleyCardSkillLeaderRateUpper(card));
        }
      }
      return slotPowerUpperBounds[slotPosition] * leaderRate;
    })
    : [];

  const slotCoefficientEstimates = remainingSlotIndices.map((slotIndex) => (
    estimateMedleySlotSkillCoefficient(slots[slotIndex], bannedCardIds)
  ));
  const slotCoefficients = slotCoefficientEstimates.map((estimate) => estimate.coefficient);
  const legacySlotCoefficients = slotCoefficientEstimates.map((estimate) => estimate.legacyCoefficient);
  observeMedleySlotCoefficientEstimates(slotCoefficientEstimates, profiling);

  if (slotCoefficients.some((coefficient) => !Number.isFinite(coefficient))) {
    return {
      upperBound: Number.NEGATIVE_INFINITY,
      coefficientUpperBound: Number.NEGATIVE_INFINITY,
      skillAwareUpperBound: useSkillAwareUpper ? Number.NEGATIVE_INFINITY : null,
      paretoUpperBound: null,
      mode: useSkillAwareUpper ? "skill-aware" : "coefficient",
    };
  }

  const cardsByCharacter = buildMedleyCapacityCardsByCharacter(slots, remainingSlotIndices, bannedCardIds);

  const slotCount = remainingSlotIndices.length;
  const maskCount = 1 << slotCount;
  const transition = getMedleyCapacityTransition(slotCount);
  let states = new Float64Array(transition.stateCount);
  states.fill(Number.NEGATIVE_INFINITY);
  states[0] = 0;
  const shouldTrackLegacyCoefficientUpperBound = Boolean(
    profiling
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    && slotCoefficientEstimates.some((estimate) => estimate.improvement > MEDLEY_SKILL_COEFFICIENT_EPSILON),
  );
  let legacyCoefficientStates = shouldTrackLegacyCoefficientUpperBound ? new Float64Array(transition.stateCount) : null;
  if (legacyCoefficientStates) {
    legacyCoefficientStates.fill(Number.NEGATIVE_INFINITY);
    legacyCoefficientStates[0] = 0;
  }
  let skillAwareStates = useSkillAwareUpper ? new Float64Array(transition.stateCount) : null;
  if (skillAwareStates) {
    skillAwareStates.fill(Number.NEGATIVE_INFINITY);
    skillAwareStates[0] = 0;
  }

  for (const cardsById of cardsByCharacter.values()) {
    let characterValues = new Float64Array(maskCount);
    characterValues.fill(Number.NEGATIVE_INFINITY);
    characterValues[0] = 0;
    let legacyCoefficientCharacterValues = legacyCoefficientStates ? new Float64Array(maskCount) : null;
    if (legacyCoefficientCharacterValues) {
      legacyCoefficientCharacterValues.fill(Number.NEGATIVE_INFINITY);
      legacyCoefficientCharacterValues[0] = 0;
    }
    let skillAwareCharacterValues = useSkillAwareUpper ? new Float64Array(maskCount) : null;
    if (skillAwareCharacterValues) {
      skillAwareCharacterValues.fill(Number.NEGATIVE_INFINITY);
      skillAwareCharacterValues[0] = 0;
    }
    for (const slotCards of cardsById.values()) {
      const nextCharacterValues = characterValues.slice();
      const nextLegacyCoefficientCharacterValues = legacyCoefficientCharacterValues?.slice() ?? null;
      const nextSkillAwareCharacterValues = skillAwareCharacterValues?.slice() ?? null;
      for (let mask = 0; mask < maskCount; mask += 1) {
        const currentValue = characterValues[mask];
        const currentLegacyCoefficientValue = legacyCoefficientCharacterValues?.[mask] ?? Number.NEGATIVE_INFINITY;
        const currentSkillAwareValue = skillAwareCharacterValues?.[mask] ?? Number.NEGATIVE_INFINITY;
        for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
          const card = slotCards[slotPosition];
          if ((mask & (1 << slotPosition)) !== 0 || !card) {
            continue;
          }
          const nextMask = mask | (1 << slotPosition);
          if (Number.isFinite(currentValue)) {
            nextCharacterValues[nextMask] = Math.max(
              nextCharacterValues[nextMask],
              currentValue + card.effectivePower * slotCoefficients[slotPosition],
            );
          }
          if (nextLegacyCoefficientCharacterValues && Number.isFinite(currentLegacyCoefficientValue)) {
            nextLegacyCoefficientCharacterValues[nextMask] = Math.max(
              nextLegacyCoefficientCharacterValues[nextMask],
              currentLegacyCoefficientValue + card.effectivePower * legacySlotCoefficients[slotPosition],
            );
          }
          if (nextSkillAwareCharacterValues && Number.isFinite(currentSkillAwareValue)) {
            nextSkillAwareCharacterValues[nextMask] = Math.max(
              nextSkillAwareCharacterValues[nextMask],
              currentSkillAwareValue
                + card.effectivePower * slots[remainingSlotIndices[slotPosition]].baseScoreRatePerPower
                + slotPowerUpperBounds[slotPosition] * getMedleyCardSkillAverageRateUpper(card),
            );
          }
        }
      }
      characterValues = nextCharacterValues;
      legacyCoefficientCharacterValues = nextLegacyCoefficientCharacterValues;
      skillAwareCharacterValues = nextSkillAwareCharacterValues;
    }

    const nextStates = states.slice();
    const nextLegacyCoefficientStates = legacyCoefficientStates?.slice() ?? null;
    const nextSkillAwareStates = skillAwareStates?.slice() ?? null;
    for (let stateIndex = 0; stateIndex < states.length; stateIndex += 1) {
      const currentValue = states[stateIndex];
      const currentLegacyCoefficientValue = legacyCoefficientStates?.[stateIndex] ?? Number.NEGATIVE_INFINITY;
      const currentSkillAwareValue = skillAwareStates?.[stateIndex] ?? Number.NEGATIVE_INFINITY;
      for (let mask = 1; mask < maskCount; mask += 1) {
        const nextIndex = transition.nextIndexByMask[stateIndex * maskCount + mask];
        if (nextIndex < 0) {
          continue;
        }
        const characterValue = characterValues[mask];
        if (Number.isFinite(currentValue) && Number.isFinite(characterValue)) {
          nextStates[nextIndex] = Math.max(nextStates[nextIndex], currentValue + characterValue);
        }
        const legacyCoefficientCharacterValue = legacyCoefficientCharacterValues?.[mask] ?? Number.NEGATIVE_INFINITY;
        if (
          nextLegacyCoefficientStates
          && Number.isFinite(currentLegacyCoefficientValue)
          && Number.isFinite(legacyCoefficientCharacterValue)
        ) {
          nextLegacyCoefficientStates[nextIndex] = Math.max(
            nextLegacyCoefficientStates[nextIndex],
            currentLegacyCoefficientValue + legacyCoefficientCharacterValue,
          );
        }
        const skillAwareCharacterValue = skillAwareCharacterValues?.[mask] ?? Number.NEGATIVE_INFINITY;
        if (nextSkillAwareStates && Number.isFinite(currentSkillAwareValue) && Number.isFinite(skillAwareCharacterValue)) {
          nextSkillAwareStates[nextIndex] = Math.max(
            nextSkillAwareStates[nextIndex],
            currentSkillAwareValue + skillAwareCharacterValue,
          );
        }
      }
    }
    states = nextStates;
    legacyCoefficientStates = nextLegacyCoefficientStates;
    skillAwareStates = nextSkillAwareStates;
  }

  const coefficientUpperBound = states[transition.targetIndex];
  const legacyCoefficientUpperBound = legacyCoefficientStates?.[transition.targetIndex] ?? null;
  if (
    profiling
    && legacyCoefficientUpperBound !== null
    && Number.isFinite(legacyCoefficientUpperBound)
    && Number.isFinite(coefficientUpperBound)
    && legacyCoefficientUpperBound > coefficientUpperBound + MEDLEY_SKILL_COEFFICIENT_EPSILON
  ) {
    const improvement = legacyCoefficientUpperBound - coefficientUpperBound;
    profiling.capacityCoefficientTighteningScoreImprovementCount += 1;
    profiling.capacityCoefficientTighteningScoreImprovementTotal += improvement;
    profiling.bestCapacityCoefficientTighteningScoreImprovement = Math.max(
      profiling.bestCapacityCoefficientTighteningScoreImprovement,
      improvement,
    );
  }
  if (!skillAwareStates) {
    return {
      upperBound: coefficientUpperBound,
      coefficientUpperBound,
      skillAwareUpperBound: null,
      paretoUpperBound: null,
      mode: "coefficient",
    };
  }
  const skillAwareUpperBound = skillAwareStates[transition.targetIndex]
    + slotLeaderConstants.reduce((sum, value) => sum + value, 0);
  let upperBound = coefficientUpperBound;
  let mode: MedleyCapacityUpperMode = "coefficient";
  if (skillAwareUpperBound < upperBound) {
    upperBound = skillAwareUpperBound;
    mode = "skill-aware";
  }
  if (useBasicSkillAwareOnly) {
    return {
      upperBound,
      coefficientUpperBound,
      skillAwareUpperBound,
      paretoUpperBound: null,
      mode,
    };
  }

  const cardSpecificCoefficientUpperBySlot = useSkillAwareUpper
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? buildMedleyCardSpecificCoefficientUpperBySlot(slots, remainingSlotIndices, bannedCardIds)
    : null;
  const cardSpecificCoefficientUpperBound = cardSpecificCoefficientUpperBySlot
    ? estimateMedleyCapacityCardSpecificCoefficientScoreUpperBound(
      remainingSlotIndices,
      cardsByCharacter,
      cardSpecificCoefficientUpperBySlot,
      profiling,
    )
    : null;
  if (
    cardSpecificCoefficientUpperBound !== null
    && Number.isFinite(cardSpecificCoefficientUpperBound)
    && cardSpecificCoefficientUpperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - cardSpecificCoefficientUpperBound;
      profiling.capacityCardSpecificCoefficientUpperImprovementCount += 1;
      profiling.capacityCardSpecificCoefficientUpperImprovementTotal += improvement;
      profiling.bestCapacityCardSpecificCoefficientUpperImprovement = Math.max(
        profiling.bestCapacityCardSpecificCoefficientUpperImprovement,
        improvement,
      );
    }
    upperBound = cardSpecificCoefficientUpperBound;
    mode = "card-specific-coefficient";
  }

  const leaderFixedCardSpecificCoefficientUpperBound = MEDLEY_ENABLE_LEADER_FIXED_CARD_SPECIFIC_UPPER
    && useParetoUpper
    && cardSpecificCoefficientUpperBySlot
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? estimateMedleyCapacityLeaderFixedCardSpecificCoefficientScoreUpperBound(
      slots,
      remainingSlotIndices,
      bannedCardIds,
      cardsByCharacter,
      cardSpecificCoefficientUpperBySlot,
      profiling,
    )
    : null;
  if (
    leaderFixedCardSpecificCoefficientUpperBound !== null
    && Number.isFinite(leaderFixedCardSpecificCoefficientUpperBound)
    && leaderFixedCardSpecificCoefficientUpperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - leaderFixedCardSpecificCoefficientUpperBound;
      profiling.capacityLeaderFixedCardSpecificUpperImprovementCount += 1;
      profiling.capacityLeaderFixedCardSpecificUpperImprovementTotal += improvement;
      profiling.bestCapacityLeaderFixedCardSpecificUpperImprovement = Math.max(
        profiling.bestCapacityLeaderFixedCardSpecificUpperImprovement,
        improvement,
      );
    }
    upperBound = leaderFixedCardSpecificCoefficientUpperBound;
    mode = "leader-fixed-card-specific-coefficient";
  }

  const leaderGroupCardSpecificCoefficientUpperBound = MEDLEY_ENABLE_LEADER_GROUP_CARD_SPECIFIC_UPPER
    && useParetoUpper
    && cardSpecificCoefficientUpperBySlot
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? estimateMedleyCapacityLeaderGroupCardSpecificCoefficientScoreUpperBound(
      slots,
      remainingSlotIndices,
      bannedCardIds,
      cardsByCharacter,
      profiling,
    )
    : null;
  if (
    leaderGroupCardSpecificCoefficientUpperBound !== null
    && Number.isFinite(leaderGroupCardSpecificCoefficientUpperBound)
    && leaderGroupCardSpecificCoefficientUpperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - leaderGroupCardSpecificCoefficientUpperBound;
      profiling.capacityLeaderGroupCardSpecificUpperImprovementCount += 1;
      profiling.capacityLeaderGroupCardSpecificUpperImprovementTotal += improvement;
      profiling.bestCapacityLeaderGroupCardSpecificUpperImprovement = Math.max(
        profiling.bestCapacityLeaderGroupCardSpecificUpperImprovement,
        improvement,
      );
    }
    upperBound = leaderGroupCardSpecificCoefficientUpperBound;
    mode = "leader-group-card-specific-coefficient";
  }

  const contextFixedCardSpecificCoefficientUpperBound = MEDLEY_ENABLE_CONTEXT_FIXED_CARD_SPECIFIC_UPPER
    && useParetoUpper
    && cardSpecificCoefficientUpperBySlot
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? estimateMedleyCapacityContextFixedCardSpecificCoefficientScoreUpperBound(
      slots,
      remainingSlotIndices,
      bannedCardIds,
      cardsByCharacter,
      cardSpecificCoefficientUpperBySlot,
      profiling,
    )
    : null;
  if (
    contextFixedCardSpecificCoefficientUpperBound !== null
    && Number.isFinite(contextFixedCardSpecificCoefficientUpperBound)
    && contextFixedCardSpecificCoefficientUpperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - contextFixedCardSpecificCoefficientUpperBound;
      profiling.capacityContextFixedCardSpecificUpperImprovementCount += 1;
      profiling.capacityContextFixedCardSpecificUpperImprovementTotal += improvement;
      profiling.bestCapacityContextFixedCardSpecificUpperImprovement = Math.max(
        profiling.bestCapacityContextFixedCardSpecificUpperImprovement,
        improvement,
      );
    }
    upperBound = contextFixedCardSpecificCoefficientUpperBound;
    mode = "context-fixed-card-specific-coefficient";
  }

  const contextGroupCardSpecificCoefficientUpperBound = MEDLEY_ENABLE_CONTEXT_GROUP_CARD_SPECIFIC_UPPER
    && useParetoUpper
    && cardSpecificCoefficientUpperBySlot
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? estimateMedleyCapacityContextGroupCardSpecificCoefficientScoreUpperBound(
      slots,
      remainingSlotIndices,
      bannedCardIds,
      cardsByCharacter,
      profiling,
    )
    : null;
  if (
    contextGroupCardSpecificCoefficientUpperBound !== null
    && Number.isFinite(contextGroupCardSpecificCoefficientUpperBound)
    && contextGroupCardSpecificCoefficientUpperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - contextGroupCardSpecificCoefficientUpperBound;
      profiling.capacityContextGroupCardSpecificUpperImprovementCount += 1;
      profiling.capacityContextGroupCardSpecificUpperImprovementTotal += improvement;
      profiling.bestCapacityContextGroupCardSpecificUpperImprovement = Math.max(
        profiling.bestCapacityContextGroupCardSpecificUpperImprovement,
        improvement,
      );
    }
    upperBound = contextGroupCardSpecificCoefficientUpperBound;
    mode = "context-group-card-specific-coefficient";
  }

  const contextBoundLagrangianUpperBound = MEDLEY_ENABLE_CONTEXT_BOUND_LAGRANGIAN_UPPER
    && useParetoUpper
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? estimateMedleyCapacityContextBoundLagrangianScoreUpperBound(
      slots,
      remainingSlotIndices,
      bannedCardIds,
      cardsByCharacter,
      profiling,
    )
    : null;
  if (
    contextBoundLagrangianUpperBound !== null
    && contextBoundLagrangianUpperBound.upperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - contextBoundLagrangianUpperBound.upperBound;
      profiling.capacityContextBoundLagrangianUpperImprovementCount += 1;
      profiling.capacityContextBoundLagrangianUpperImprovementTotal += improvement;
      profiling.bestCapacityContextBoundLagrangianUpperImprovement = Math.max(
        profiling.bestCapacityContextBoundLagrangianUpperImprovement,
        improvement,
      );
      profiling.bestCapacityContextBoundLagrangianWeight = contextBoundLagrangianUpperBound.weight;
    }
    upperBound = contextBoundLagrangianUpperBound.upperBound;
    mode = "context-bound-lagrangian";
  }

  const contextBoundBucketedJointUpperBound = MEDLEY_ENABLE_CONTEXT_BOUND_BUCKETED_JOINT_UPPER
    && useParetoUpper
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? estimateMedleyCapacityContextBoundBucketedJointScoreUpperBound(
      slots,
      remainingSlotIndices,
      bannedCardIds,
      cardsByCharacter,
      profiling,
    )
    : null;
  if (
    contextBoundBucketedJointUpperBound !== null
    && contextBoundBucketedJointUpperBound.upperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - contextBoundBucketedJointUpperBound.upperBound;
      profiling.capacityContextBoundBucketedJointUpperImprovementCount += 1;
      profiling.capacityContextBoundBucketedJointUpperImprovementTotal += improvement;
      profiling.bestCapacityContextBoundBucketedJointUpperImprovement = Math.max(
        profiling.bestCapacityContextBoundBucketedJointUpperImprovement,
        improvement,
      );
      profiling.capacityContextBoundBucketedJointUpperBucketSize = contextBoundBucketedJointUpperBound.bucketSize;
      profiling.capacityContextBoundBucketedJointUpperTargetBucketCount = (
        contextBoundBucketedJointUpperBound.targetBucketCount
      );
    }
    upperBound = contextBoundBucketedJointUpperBound.upperBound;
    mode = "context-bound-bucketed-joint";
  }

  const contextBoundMcCormickUpperBound = MEDLEY_ENABLE_CONTEXT_BOUND_MCCORMICK_UPPER
    && useParetoUpper
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? estimateMedleyCapacityContextBoundMcCormickScoreUpperBound(
      slots,
      remainingSlotIndices,
      bannedCardIds,
      cardsByCharacter,
      profiling,
      enableTeamSharedCoefficientUpper,
    )
    : null;
  if (
    contextBoundMcCormickUpperBound !== null
    && Number.isFinite(contextBoundMcCormickUpperBound)
    && contextBoundMcCormickUpperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - contextBoundMcCormickUpperBound;
      profiling.capacityContextBoundMcCormickUpperImprovementCount += 1;
      profiling.capacityContextBoundMcCormickUpperImprovementTotal += improvement;
      profiling.bestCapacityContextBoundMcCormickUpperImprovement = Math.max(
        profiling.bestCapacityContextBoundMcCormickUpperImprovement,
        improvement,
      );
    }
    upperBound = contextBoundMcCormickUpperBound;
    mode = "context-bound-mccormick";
  }

  const cardMinCoefficientUpperBound = MEDLEY_ENABLE_CARD_MIN_COEFFICIENT_UPPER
    && useParetoUpper
    && cardSpecificCoefficientUpperBySlot
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? estimateMedleyCapacityCardMinCoefficientScoreUpperBound(
      remainingSlotIndices,
      cardsByCharacter,
      cardSpecificCoefficientUpperBySlot,
      coefficientUpperBound,
      profiling,
    )
    : null;
  if (
    cardMinCoefficientUpperBound !== null
    && cardMinCoefficientUpperBound.upperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - cardMinCoefficientUpperBound.upperBound;
      profiling.capacityCardMinCoefficientUpperImprovementCount += 1;
      profiling.capacityCardMinCoefficientUpperImprovementTotal += improvement;
      profiling.bestCapacityCardMinCoefficientUpperImprovement = Math.max(
        profiling.bestCapacityCardMinCoefficientUpperImprovement,
        improvement,
      );
      profiling.capacityCardMinCoefficientUpperBucketSize = cardMinCoefficientUpperBound.bucketSize;
      profiling.capacityCardMinCoefficientUpperTargetBucketCount = cardMinCoefficientUpperBound.targetBucketCount;
    }
    upperBound = cardMinCoefficientUpperBound.upperBound;
    mode = "card-min-coefficient";
  }

  const cardBoundPowerUpperBySlot = useSkillAwareUpper
    ? buildMedleyCardBoundPowerUpperBySlot(slots, remainingSlotIndices, bannedCardIds)
    : null;
  const cardBoundSkillAwareUpperBound = cardBoundPowerUpperBySlot
    ? estimateMedleyCapacityCardBoundSkillAwareScoreUpperBound(
      slots,
      remainingSlotIndices,
      cardsByCharacter,
      cardBoundPowerUpperBySlot,
      profiling,
    )
    : null;
  if (
    cardBoundSkillAwareUpperBound !== null
    && Number.isFinite(cardBoundSkillAwareUpperBound)
    && cardBoundSkillAwareUpperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - cardBoundSkillAwareUpperBound;
      profiling.capacityCardBoundUpperImprovementCount += 1;
      profiling.capacityCardBoundUpperImprovementTotal += improvement;
      profiling.bestCapacityCardBoundUpperImprovement = Math.max(
        profiling.bestCapacityCardBoundUpperImprovement,
        improvement,
      );
    }
    upperBound = cardBoundSkillAwareUpperBound;
    mode = "card-bound-skill-aware";
  }

  const sharedPowerSkillUpperBound = enableSharedPowerSkillUpper && cardBoundPowerUpperBySlot
    ? estimateMedleyCapacityCardBoundSharedPowerSkillScoreUpperBound(
      slots,
      remainingSlotIndices,
      cardsByCharacter,
      bannedCardIds,
      profiling,
    )
    : null;
  if (
    sharedPowerSkillUpperBound !== null
    && Number.isFinite(sharedPowerSkillUpperBound)
    && sharedPowerSkillUpperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - sharedPowerSkillUpperBound;
      profiling.capacityCardBoundSharedPowerUpperImprovementCount += 1;
      profiling.capacityCardBoundSharedPowerUpperImprovementTotal += improvement;
      profiling.bestCapacityCardBoundSharedPowerUpperImprovement = Math.max(
        profiling.bestCapacityCardBoundSharedPowerUpperImprovement,
        improvement,
      );
    }
    upperBound = sharedPowerSkillUpperBound;
    mode = "card-bound-shared-power-skill";
  }

  const cardBoundLagrangianUpperBound = cardBoundPowerUpperBySlot
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? estimateMedleyCapacityCardBoundLagrangianScoreUpperBound(
      slots,
      remainingSlotIndices,
      cardsByCharacter,
      slotCoefficients,
      cardBoundPowerUpperBySlot,
      profiling,
    )
    : null;
  if (
    cardBoundLagrangianUpperBound !== null
    && cardBoundLagrangianUpperBound.upperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - cardBoundLagrangianUpperBound.upperBound;
      profiling.capacityCardBoundLagrangianUpperImprovementCount += 1;
      profiling.capacityCardBoundLagrangianUpperImprovementTotal += improvement;
      profiling.bestCapacityCardBoundLagrangianUpperImprovement = Math.max(
        profiling.bestCapacityCardBoundLagrangianUpperImprovement,
        improvement,
      );
      profiling.bestCapacityCardBoundLagrangianWeight = cardBoundLagrangianUpperBound.weight;
    }
    upperBound = cardBoundLagrangianUpperBound.upperBound;
    mode = "card-bound-lagrangian";
  }

  const cardSpecificLagrangianUpperBound = MEDLEY_ENABLE_CARD_SPECIFIC_LAGRANGIAN_UPPER
    && cardBoundPowerUpperBySlot
    && cardSpecificCoefficientUpperBySlot
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? estimateMedleyCapacityCardSpecificLagrangianScoreUpperBound(
      slots,
      remainingSlotIndices,
      cardsByCharacter,
      slotCoefficients,
      cardSpecificCoefficientUpperBySlot,
      cardBoundPowerUpperBySlot,
      profiling,
    )
    : null;
  if (
    cardSpecificLagrangianUpperBound !== null
    && cardSpecificLagrangianUpperBound.upperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - cardSpecificLagrangianUpperBound.upperBound;
      profiling.capacityCardSpecificLagrangianUpperImprovementCount += 1;
      profiling.capacityCardSpecificLagrangianUpperImprovementTotal += improvement;
      profiling.bestCapacityCardSpecificLagrangianUpperImprovement = Math.max(
        profiling.bestCapacityCardSpecificLagrangianUpperImprovement,
        improvement,
      );
      profiling.bestCapacityCardSpecificLagrangianWeight = cardSpecificLagrangianUpperBound.weight;
    }
    upperBound = cardSpecificLagrangianUpperBound.upperBound;
    mode = "card-specific-lagrangian";
  }

  const cardBoundBucketedJointUpperBound = cardBoundPowerUpperBySlot
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? estimateMedleyCapacityCardBoundBucketedJointScoreUpperBound(
      slots,
      remainingSlotIndices,
      cardsByCharacter,
      slotCoefficients,
      cardBoundPowerUpperBySlot,
      coefficientUpperBound,
      profiling,
    )
    : null;
  if (
    cardBoundBucketedJointUpperBound !== null
    && cardBoundBucketedJointUpperBound.upperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - cardBoundBucketedJointUpperBound.upperBound;
      profiling.capacityCardBoundBucketedJointUpperImprovementCount += 1;
      profiling.capacityCardBoundBucketedJointUpperImprovementTotal += improvement;
      profiling.bestCapacityCardBoundBucketedJointUpperImprovement = Math.max(
        profiling.bestCapacityCardBoundBucketedJointUpperImprovement,
        improvement,
      );
      profiling.capacityCardBoundBucketedJointUpperBucketSize = cardBoundBucketedJointUpperBound.bucketSize;
      profiling.capacityCardBoundBucketedJointUpperTargetBucketCount = (
        cardBoundBucketedJointUpperBound.targetBucketCount
      );
    }
    upperBound = cardBoundBucketedJointUpperBound.upperBound;
    mode = "card-bound-bucketed-joint";
  }

  const cardBoundDualObjectiveUpperBound = MEDLEY_ENABLE_CARD_BOUND_DUAL_OBJECTIVE_UPPER
    && useParetoUpper
    && cardBoundPowerUpperBySlot
    && remainingSlotIndices.length === MEDLEY_TEAM_COUNT
    && bannedCardIds.size === 0
    ? estimateMedleyCapacityCardBoundDualObjectiveScoreUpperBound(
      slots,
      remainingSlotIndices,
      cardsByCharacter,
      slotCoefficients,
      cardBoundPowerUpperBySlot,
      profiling,
    )
    : null;
  if (
    cardBoundDualObjectiveUpperBound !== null
    && Number.isFinite(cardBoundDualObjectiveUpperBound)
    && cardBoundDualObjectiveUpperBound < upperBound
  ) {
    if (profiling && Number.isFinite(upperBound)) {
      const improvement = upperBound - cardBoundDualObjectiveUpperBound;
      profiling.capacityCardBoundDualUpperImprovementCount += 1;
      profiling.capacityCardBoundDualUpperImprovementTotal += improvement;
      profiling.bestCapacityCardBoundDualUpperImprovement = Math.max(
        profiling.bestCapacityCardBoundDualUpperImprovement,
        improvement,
      );
    }
    upperBound = cardBoundDualObjectiveUpperBound;
    mode = "card-bound-dual-objective";
  }

  const bucketedUpperBound = useBucketedUpper
    ? estimateMedleyCapacityBucketedScoreUpperBound(
      slots,
      remainingSlotIndices,
      cardsByCharacter,
      slotPowerUpperBounds,
      profiling,
    )
    : null;
  if (bucketedUpperBound !== null && bucketedUpperBound < upperBound) {
    if (profiling && Number.isFinite(upperBound) && Number.isFinite(bucketedUpperBound)) {
      const improvement = upperBound - bucketedUpperBound;
      profiling.bestCapacityBucketedImprovement = Math.max(
        profiling.bestCapacityBucketedImprovement,
        improvement,
      );
      profiling.capacityBucketedUpperImprovementCount += 1;
      profiling.capacityBucketedUpperImprovementTotal += improvement;
    }
    upperBound = bucketedUpperBound;
    mode = "bucketed-capacity";
  }

  const dualObjectiveUpperBound = useParetoUpper
    ? estimateMedleyCapacityDualObjectiveScoreUpperBound(
      slots,
      remainingSlotIndices,
      cardsByCharacter,
      slotCoefficients,
      slotPowerUpperBounds,
      slotLeaderConstants.reduce((sum, value) => sum + value, 0),
      profiling,
    )
    : null;
  if (dualObjectiveUpperBound !== null && dualObjectiveUpperBound < upperBound) {
    if (profiling && Number.isFinite(upperBound) && Number.isFinite(dualObjectiveUpperBound)) {
      profiling.bestCapacityParetoImprovement = Math.max(
        profiling.bestCapacityParetoImprovement,
        upperBound - dualObjectiveUpperBound,
      );
    }
    upperBound = dualObjectiveUpperBound;
    mode = "dual-objective";
  }

  const fullParetoUpperBound = useParetoUpper && remainingSlotIndices.length === 2
    ? estimateMedleyCapacityParetoScoreUpperBound(
      slots,
      remainingSlotIndices,
      bannedCardIds,
      profiling,
    )
    : null;
  if (fullParetoUpperBound !== null && fullParetoUpperBound < upperBound) {
    if (profiling && Number.isFinite(upperBound) && Number.isFinite(fullParetoUpperBound)) {
      profiling.bestCapacityParetoImprovement = Math.max(
        profiling.bestCapacityParetoImprovement,
        upperBound - fullParetoUpperBound,
      );
    }
    upperBound = fullParetoUpperBound;
    mode = "pareto";
  }

  return {
    upperBound,
    coefficientUpperBound,
    skillAwareUpperBound,
    paretoUpperBound: fullParetoUpperBound
      ?? dualObjectiveUpperBound
      ?? cardBoundDualObjectiveUpperBound
      ?? cardBoundBucketedJointUpperBound?.upperBound
      ?? cardBoundLagrangianUpperBound?.upperBound
      ?? cardMinCoefficientUpperBound?.upperBound
      ?? contextBoundBucketedJointUpperBound?.upperBound
      ?? contextBoundMcCormickUpperBound
      ?? cardSpecificCoefficientUpperBound
      ?? bucketedUpperBound,
    mode,
  };
}

// Public dispatcher used by DFS. It computes the cheap correlated bound and the selected
// capacity-bound families, then returns the tighter safe value while recording the limiting
// model for diagnostics.
function medleyRemainingSlotsHaveDuplicateCardIds(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
): boolean {
  return remainingSlotIndices.some((slotIndex) => {
    const cardIds = slots[slotIndex].searchCards.map((card) => card.cardId);
    return new Set(cardIds).size !== cardIds.length;
  });
}

export function estimateMedleyRemainingScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
  useContextualSkillUpper = false,
  useSkillAwareCapacityUpper = false,
  useParetoCapacityUpper = false,
  useBucketedCapacityUpper = false,
  enableTeamSharedCoefficientUpper = false,
  enableSharedPowerSkillUpper = false,
): number {
  if (remainingSlotIndices.length === 0) {
    return 0;
  }

  const correlatedSlotUpperBounds: number[] = [];
  let correlatedSlotUpperBound = 0;
  for (const slotIndex of remainingSlotIndices) {
    const slotUpperBound = estimateMedleySlotBranchScoreUpperBound(
      slots[slotIndex],
      [],
      0,
      bannedCardIds,
      0,
      0,
      0,
      profiling,
      useContextualSkillUpper,
    );
    if (!Number.isFinite(slotUpperBound)) {
      return Number.NEGATIVE_INFINITY;
    }
    correlatedSlotUpperBounds.push(slotUpperBound);
    correlatedSlotUpperBound += slotUpperBound;
  }

  if (medleyRemainingSlotsHaveDuplicateCardIds(slots, remainingSlotIndices)) {
    if (
      profiling
      && Number.isFinite(correlatedSlotUpperBound)
      && correlatedSlotUpperBound > (profiling.remainingUpperBoundMax ?? Number.NEGATIVE_INFINITY)
    ) {
      profiling.remainingUpperBoundMax = correlatedSlotUpperBound;
      profiling.remainingUpperBoundMaxCorrelated = correlatedSlotUpperBound;
      profiling.remainingUpperBoundMaxCapacity = null;
      profiling.remainingUpperBoundMaxCapacityMode = null;
      profiling.remainingUpperBoundMaxSlotCount = remainingSlotIndices.length;
      profiling.remainingUpperBoundMaxLimiter = "correlated";
    }
    return correlatedSlotUpperBound;
  }

  const capacityAssignmentUpperBound = estimateMedleyCapacityAssignmentScoreUpperBound(
    slots,
    remainingSlotIndices,
    bannedCardIds,
    profiling,
    useSkillAwareCapacityUpper && remainingSlotIndices.length > 1,
    useParetoCapacityUpper && remainingSlotIndices.length > 1,
    useBucketedCapacityUpper && remainingSlotIndices.length > 1,
    enableTeamSharedCoefficientUpper && remainingSlotIndices.length === MEDLEY_TEAM_COUNT,
    enableSharedPowerSkillUpper && remainingSlotIndices.length === MEDLEY_TEAM_COUNT,
  );

  let capacityUpperBound = capacityAssignmentUpperBound.upperBound;
  let capacityUpperBoundMode = capacityAssignmentUpperBound.mode;
  if (useParetoCapacityUpper && remainingSlotIndices.length === MEDLEY_TEAM_COUNT) {
    let relaxedPairParetoUpperBound = Number.POSITIVE_INFINITY;
    for (let omittedSlotPosition = 0; omittedSlotPosition < remainingSlotIndices.length; omittedSlotPosition += 1) {
      const pairSlotIndices = remainingSlotIndices.filter((_, slotPosition) => slotPosition !== omittedSlotPosition);
      const pairParetoUpperBound = estimateMedleyCapacityParetoScoreUpperBound(
        slots,
        pairSlotIndices,
        bannedCardIds,
        profiling,
      );
      if (pairParetoUpperBound === null || !Number.isFinite(pairParetoUpperBound)) {
        continue;
      }
      relaxedPairParetoUpperBound = Math.min(
        relaxedPairParetoUpperBound,
        pairParetoUpperBound + correlatedSlotUpperBounds[omittedSlotPosition],
      );
    }
    if (relaxedPairParetoUpperBound < capacityUpperBound) {
      if (profiling && Number.isFinite(capacityUpperBound)) {
        profiling.bestCapacityParetoImprovement = Math.max(
          profiling.bestCapacityParetoImprovement,
          capacityUpperBound - relaxedPairParetoUpperBound,
        );
      }
      capacityUpperBound = relaxedPairParetoUpperBound;
      capacityUpperBoundMode = "pareto-relaxed-pair";
    }
  }

  const upperBound = Math.min(capacityUpperBound, correlatedSlotUpperBound);
  if (
    profiling
    && Number.isFinite(upperBound)
    && upperBound > (profiling.remainingUpperBoundMax ?? Number.NEGATIVE_INFINITY)
  ) {
    profiling.remainingUpperBoundMax = upperBound;
    profiling.remainingUpperBoundMaxCorrelated = correlatedSlotUpperBound;
    profiling.remainingUpperBoundMaxCapacity = capacityUpperBound;
    profiling.remainingUpperBoundMaxCapacityMode = capacityUpperBoundMode;
    profiling.remainingUpperBoundMaxSlotCount = remainingSlotIndices.length;
    profiling.remainingUpperBoundMaxLimiter = capacityUpperBound <= correlatedSlotUpperBound
      ? "capacity"
      : "correlated";
  }

  return upperBound;
}
