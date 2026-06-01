/*
 * Context-bound capacity upper models for medley search.
 *
 * These routines group cards by band/attribute skill context and use McCormick or bucketed
 * relaxations. The grouping may be loose, but it must never exclude a feasible context.
 */

import {
  MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_GLOBAL_STATE_BUDGET,
  MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_MAX_PROCESSED_COMBINATIONS,
  MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_MIN_BUCKET_SIZE,
  MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_SCORE_WINDOW,
  MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_STATE_BUDGET,
  MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_TARGET_BUCKET_COUNTS,
  MEDLEY_CONTEXT_BOUND_CARD_BOUND_MAX_PROCESSED_COMBINATIONS,
  MEDLEY_CONTEXT_BOUND_LAGRANGIAN_MAX_GROUP_COMBINATIONS,
  MEDLEY_CONTEXT_BOUND_LAGRANGIAN_WEIGHTS,
  MEDLEY_CONTEXT_BOUND_MCCORMICK_MAX_PROCESSED_COMBINATIONS,
  MEDLEY_CONTEXT_BOUND_MCCORMICK_SCORE_WINDOW,
  MEDLEY_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_BUCKET_COUNT,
  MEDLEY_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_GLOBAL_STATE_BUDGET,
  MEDLEY_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_MAX_PROCESSED_COMBINATIONS,
  MEDLEY_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_STATE_BUDGET,
  MEDLEY_CONTEXT_BOUND_SPLIT_SKILL_MCCORMICK_MAX_PROCESSED_COMBINATIONS,
  MEDLEY_CONTEXT_GROUP_CARD_SPECIFIC_TAIL_GROUP_SIZE,
  MEDLEY_CONTEXT_GROUP_CARD_SPECIFIC_TOP_COUNT,
  MEDLEY_ENABLE_CONTEXT_BOUND_CARD_BOUND_UPPER,
  MEDLEY_ENABLE_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_UPPER,
  MEDLEY_ENABLE_CONTEXT_BOUND_SPLIT_SKILL_MCCORMICK_UPPER,
  MEDLEY_ENABLE_TEAM_SHARED_COEFFICIENT_UPPER,
  MEDLEY_LEADER_GROUP_CARD_SPECIFIC_TAIL_GROUP_SIZE,
  MEDLEY_LEADER_GROUP_CARD_SPECIFIC_TOP_COUNT,
  MEDLEY_TEAM_COUNT,
  MEDLEY_TEAM_SHARED_COEFFICIENT_GLOBAL_STATE_BUDGET,
  MEDLEY_TEAM_SHARED_COEFFICIENT_INTERVAL_COUNT,
  MEDLEY_TEAM_SHARED_COEFFICIENT_MAX_PROCESSED_COMBINATIONS,
  MEDLEY_TEAM_SHARED_COEFFICIENT_STATE_BUDGET,
  MEDLEY_TEAM_SIZE,
} from "../constants";
import {
  addMedleyCapacityBucketedJointState,
  cloneMedleyCapacityBucketedJointStateMap,
  getMedleyCapacityBucketedJointBucket,
  getMedleyCapacityTransition,
  pruneMedleyCapacityBucketedJointStateMaps,
} from "./capacity-core";
import {
  estimateMedleyCapacityCardSpecificCoefficientScoreUpperBound,
  estimateMedleyCapacityContextBoundWeightedScoreUpperBound,
  estimateMedleyContextFixedCardSpecificSkillCoefficient,
  estimateMedleyLeaderFixedCardSpecificSkillCoefficient,
} from "./card-bound";
import { buildMedleyCapacityCardsByCharacter } from "./common";
import { calculateSkillScoreUpperBoundsForPower } from "@/lib/bandori/team-builder/core/scoring";
import {
  buildMedleySkillContextUppers,
  getMedleyCardSkillAverageRateForContext,
  getMedleyCardSkillAverageRateUpper,
  getMedleyCardSkillLeaderRateForContext,
  getMedleyCardSkillLeaderRateUpper,
  medleyCardMatchesSkillContext,
} from "./skill-context";
import type {
  BandoriMedleyTeamSearchProfilingStats,
  MedleyCapacityBucketedJointUpperEstimate,
  MedleyCapacityCardsByCharacter,
  MedleyCapacityWeightedUpperEstimate,
  MedleyCardBoundPowerUpperBySlot,
  MedleyCardSpecificCoefficientUpperBySlot,
  MedleyContextBoundMcCormickSlotBounds,
  MedleyContextBoundSkillRateBounds,
  MedleyContextBoundUpperGroup,
  MedleySkillContextUpper,
  MedleySlotSearch,
} from "../types";
import type { SearchCard } from "@/lib/bandori/team-builder/core";

type MedleyContextBoundSkillScoreUpper = {
  averageScore: number;
  leaderScore: number;
  leaderTotalScore: number;
};

function estimateMedleyContextBoundSkillScoreUpper(
  slot: MedleySlotSearch,
  card: SearchCard,
  cardBoundPowerUpper: number,
  averageRate: number,
  leaderRate: number,
  floorAwareCache: Map<string, { averageScore: number; leaderScore: number }>,
): MedleyContextBoundSkillScoreUpper {
  const bandPowerUpper = Math.floor(Math.max(0, cardBoundPowerUpper));
  const cacheKey = `${card.skillSearchSignature}:${bandPowerUpper}`;
  let floorAwareScoreUpper = floorAwareCache.get(cacheKey);
  if (floorAwareScoreUpper === undefined) {
    floorAwareScoreUpper = calculateSkillScoreUpperBoundsForPower(
      slot.chart,
      slot.input.skillsById[String(card.skillId)],
      card.skillLevel,
      slot.input.server ?? 0,
      bandPowerUpper,
      slot.comboOptions,
    );
    floorAwareCache.set(cacheKey, floorAwareScoreUpper);
  }

  const continuousAverageScore = cardBoundPowerUpper * averageRate;
  const continuousLeaderScore = cardBoundPowerUpper * leaderRate;
  const averageScore = Math.min(continuousAverageScore, floorAwareScoreUpper.averageScore);
  const leaderScore = Math.min(continuousLeaderScore, floorAwareScoreUpper.leaderScore);
  return {
    averageScore,
    leaderScore,
    leaderTotalScore: Math.min(
      averageScore + leaderScore,
      continuousAverageScore + continuousLeaderScore,
      floorAwareScoreUpper.averageScore + floorAwareScoreUpper.leaderScore,
    ),
  };
}

export function buildMedleyLeaderFixedCardSpecificCoefficientUpper(
  slot: MedleySlotSearch,
  leaderCharacterId: number,
  leaderComboRate: number,
  sortedAverageRatesByCharacter: Array<[number, number]>,
  bannedCardIds: Set<number>,
): Map<number, number> {
  const coefficientUpperByCardId = new Map<number, number>();
  for (const card of slot.searchCards) {
    if (bannedCardIds.has(card.cardId)) {
      continue;
    }
    const coefficient = estimateMedleyLeaderFixedCardSpecificSkillCoefficient(
      slot,
      card,
      sortedAverageRatesByCharacter,
      leaderCharacterId,
      leaderComboRate,
    );
    if (coefficient !== null && Number.isFinite(coefficient)) {
      coefficientUpperByCardId.set(card.cardId, coefficient);
    }
  }
  return coefficientUpperByCardId;
}

export function buildMedleyLeaderFixedSkillContext(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
): {
  leaderComboRateByCharacter: Map<number, number>;
  sortedAverageRatesByCharacter: Array<[number, number]>;
} {
  const averageRateByCharacter = new Map<number, number>();
  const leaderComboRateByCharacter = new Map<number, number>();
  for (const card of slot.searchCards) {
    if (bannedCardIds.has(card.cardId)) {
      continue;
    }
    const averageRate = getMedleyCardSkillAverageRateUpper(card);
    const leaderComboRate = averageRate + getMedleyCardSkillLeaderRateUpper(card);
    averageRateByCharacter.set(
      card.characterId,
      Math.max(averageRateByCharacter.get(card.characterId) ?? Number.NEGATIVE_INFINITY, averageRate),
    );
    leaderComboRateByCharacter.set(
      card.characterId,
      Math.max(leaderComboRateByCharacter.get(card.characterId) ?? Number.NEGATIVE_INFINITY, leaderComboRate),
    );
  }

  return {
    leaderComboRateByCharacter,
    sortedAverageRatesByCharacter: [...averageRateByCharacter.entries()]
      .sort((left, right) => right[1] - left[1]),
  };
}

export function estimateMedleyCapacityLeaderFixedCardSpecificCoefficientScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  cardSpecificCoefficientUpperBySlot: MedleyCardSpecificCoefficientUpperBySlot,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  if (remainingSlotIndices.length !== MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityLeaderFixedCardSpecificUpperCallCount += 1;
  }

  let bestFixedSlotUpperBound = Number.POSITIVE_INFINITY;
  for (let fixedSlotPosition = 0; fixedSlotPosition < remainingSlotIndices.length; fixedSlotPosition += 1) {
    const slot = slots[remainingSlotIndices[fixedSlotPosition]];
    const { leaderComboRateByCharacter, sortedAverageRatesByCharacter } = buildMedleyLeaderFixedSkillContext(
      slot,
      bannedCardIds,
    );
    let fixedSlotUpperBound = Number.NEGATIVE_INFINITY;

    for (const [leaderCharacterId, leaderComboRate] of leaderComboRateByCharacter) {
      const coefficientUpperBySlot = cardSpecificCoefficientUpperBySlot.slice();
      coefficientUpperBySlot[fixedSlotPosition] = buildMedleyLeaderFixedCardSpecificCoefficientUpper(
        slot,
        leaderCharacterId,
        leaderComboRate,
        sortedAverageRatesByCharacter,
        bannedCardIds,
      );
      const upperBound = estimateMedleyCapacityCardSpecificCoefficientScoreUpperBound(
        remainingSlotIndices,
        cardsByCharacter,
        coefficientUpperBySlot,
      );
      if (upperBound !== null && Number.isFinite(upperBound)) {
        fixedSlotUpperBound = Math.max(fixedSlotUpperBound, upperBound);
      }
    }

    if (!Number.isFinite(fixedSlotUpperBound)) {
      return null;
    }
    bestFixedSlotUpperBound = Math.min(bestFixedSlotUpperBound, fixedSlotUpperBound);
  }

  if (!Number.isFinite(bestFixedSlotUpperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityLeaderFixedCardSpecificUpperCompletedCount += 1;
  }
  return bestFixedSlotUpperBound;
}

export function buildMedleyLeaderGroupCardSpecificCoefficientUppers(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
  topLeaderCount: number,
): Array<Map<number, number>> {
  const { leaderComboRateByCharacter, sortedAverageRatesByCharacter } = buildMedleyLeaderFixedSkillContext(
    slot,
    bannedCardIds,
  );
  const leaderEntries = [...leaderComboRateByCharacter.entries()]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0]);
  const leaderGroups: Array<Array<[number, number]>> = leaderEntries
    .slice(0, Math.max(0, topLeaderCount))
    .map((entry) => [entry]);
  const remainingLeaderEntries = leaderEntries.slice(Math.max(0, topLeaderCount));
  for (let index = 0; index < remainingLeaderEntries.length; index += MEDLEY_LEADER_GROUP_CARD_SPECIFIC_TAIL_GROUP_SIZE) {
    leaderGroups.push(remainingLeaderEntries.slice(index, index + MEDLEY_LEADER_GROUP_CARD_SPECIFIC_TAIL_GROUP_SIZE));
  }

  return leaderGroups.map((leaderGroup) => {
    const coefficientUpperByCardId = new Map<number, number>();
    for (const card of slot.searchCards) {
      if (bannedCardIds.has(card.cardId)) {
        continue;
      }
      let bestCoefficient = Number.NEGATIVE_INFINITY;
      for (const [leaderCharacterId, leaderComboRate] of leaderGroup) {
        const coefficient = estimateMedleyLeaderFixedCardSpecificSkillCoefficient(
          slot,
          card,
          sortedAverageRatesByCharacter,
          leaderCharacterId,
          leaderComboRate,
        );
        if (coefficient !== null && Number.isFinite(coefficient)) {
          bestCoefficient = Math.max(bestCoefficient, coefficient);
        }
      }
      if (Number.isFinite(bestCoefficient)) {
        coefficientUpperByCardId.set(card.cardId, bestCoefficient);
      }
    }
    return coefficientUpperByCardId;
  });
}

export function estimateMedleyCapacityLeaderGroupCardSpecificCoefficientScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  if (remainingSlotIndices.length !== MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityLeaderGroupCardSpecificUpperCallCount += 1;
  }

  const coefficientGroupsBySlot = remainingSlotIndices.map((slotIndex) => (
    buildMedleyLeaderGroupCardSpecificCoefficientUppers(
      slots[slotIndex],
      bannedCardIds,
      MEDLEY_LEADER_GROUP_CARD_SPECIFIC_TOP_COUNT,
    )
  ));
  if (coefficientGroupsBySlot.some((groups) => groups.length === 0)) {
    return null;
  }

  let combinationCount = 1;
  for (const groups of coefficientGroupsBySlot) {
    combinationCount *= groups.length;
  }
  if (profiling) {
    profiling.capacityLeaderGroupCardSpecificUpperGroupCount = combinationCount;
  }

  let upperBound = Number.NEGATIVE_INFINITY;
  for (const firstSlotCoefficients of coefficientGroupsBySlot[0]) {
    for (const secondSlotCoefficients of coefficientGroupsBySlot[1]) {
      for (const thirdSlotCoefficients of coefficientGroupsBySlot[2]) {
        const estimate = estimateMedleyCapacityCardSpecificCoefficientScoreUpperBound(
          remainingSlotIndices,
          cardsByCharacter,
          [firstSlotCoefficients, secondSlotCoefficients, thirdSlotCoefficients],
        );
        if (estimate !== null && Number.isFinite(estimate)) {
          upperBound = Math.max(upperBound, estimate);
        }
      }
    }
  }

  if (!Number.isFinite(upperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityLeaderGroupCardSpecificUpperCompletedCount += 1;
  }
  return upperBound;
}

export function buildMedleyContextFixedSkillContext(
  slot: MedleySlotSearch,
  context: MedleySkillContextUpper,
  bannedCardIds: Set<number>,
): {
  leaderComboRateByCharacter: Map<number, number>;
  sortedAverageRatesByCharacter: Array<[number, number]>;
} {
  const averageRateByCharacter = new Map<number, number>();
  const leaderComboRateByCharacter = new Map<number, number>();
  for (const card of slot.searchCards) {
    if (bannedCardIds.has(card.cardId) || !medleyCardMatchesSkillContext(card, context)) {
      continue;
    }
    const averageRate = getMedleyCardSkillAverageRateForContext(card, context.mode);
    const leaderComboRate = averageRate + getMedleyCardSkillLeaderRateForContext(card, context.mode);
    averageRateByCharacter.set(
      card.characterId,
      Math.max(averageRateByCharacter.get(card.characterId) ?? Number.NEGATIVE_INFINITY, averageRate),
    );
    leaderComboRateByCharacter.set(
      card.characterId,
      Math.max(leaderComboRateByCharacter.get(card.characterId) ?? Number.NEGATIVE_INFINITY, leaderComboRate),
    );
  }

  return {
    leaderComboRateByCharacter,
    sortedAverageRatesByCharacter: [...averageRateByCharacter.entries()]
      .sort((left, right) => right[1] - left[1]),
  };
}

export function buildMedleyContextFixedCardSpecificCoefficientUpper(
  slot: MedleySlotSearch,
  context: MedleySkillContextUpper,
  sortedAverageRatesByCharacter: Array<[number, number]>,
  leaderComboRateByCharacter: Map<number, number>,
  bannedCardIds: Set<number>,
): Map<number, number> {
  const coefficientUpperByCardId = new Map<number, number>();
  for (const card of slot.searchCards) {
    if (bannedCardIds.has(card.cardId)) {
      continue;
    }
    const coefficient = estimateMedleyContextFixedCardSpecificSkillCoefficient(
      slot,
      card,
      context,
      sortedAverageRatesByCharacter,
      leaderComboRateByCharacter,
    );
    if (coefficient !== null && Number.isFinite(coefficient)) {
      coefficientUpperByCardId.set(card.cardId, coefficient);
    }
  }
  return coefficientUpperByCardId;
}

export function estimateMedleyCapacityContextFixedCardSpecificCoefficientScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  cardSpecificCoefficientUpperBySlot: MedleyCardSpecificCoefficientUpperBySlot,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  if (remainingSlotIndices.length !== MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextFixedCardSpecificUpperCallCount += 1;
  }

  let bestFixedSlotUpperBound = Number.POSITIVE_INFINITY;
  for (let fixedSlotPosition = 0; fixedSlotPosition < remainingSlotIndices.length; fixedSlotPosition += 1) {
    const slot = slots[remainingSlotIndices[fixedSlotPosition]];
    const contexts = buildMedleySkillContextUppers(slot, []);
    let fixedSlotUpperBound = Number.NEGATIVE_INFINITY;

    for (const context of contexts) {
      const { leaderComboRateByCharacter, sortedAverageRatesByCharacter } = buildMedleyContextFixedSkillContext(
        slot,
        context,
        bannedCardIds,
      );
      if (sortedAverageRatesByCharacter.length < MEDLEY_TEAM_SIZE) {
        continue;
      }
      const coefficientUpperBySlot = cardSpecificCoefficientUpperBySlot.slice();
      coefficientUpperBySlot[fixedSlotPosition] = buildMedleyContextFixedCardSpecificCoefficientUpper(
        slot,
        context,
        sortedAverageRatesByCharacter,
        leaderComboRateByCharacter,
        bannedCardIds,
      );
      const upperBound = estimateMedleyCapacityCardSpecificCoefficientScoreUpperBound(
        remainingSlotIndices,
        cardsByCharacter,
        coefficientUpperBySlot,
      );
      if (upperBound !== null && Number.isFinite(upperBound)) {
        fixedSlotUpperBound = Math.max(fixedSlotUpperBound, upperBound);
      }
    }

    if (!Number.isFinite(fixedSlotUpperBound)) {
      return null;
    }
    bestFixedSlotUpperBound = Math.min(bestFixedSlotUpperBound, fixedSlotUpperBound);
  }

  if (!Number.isFinite(bestFixedSlotUpperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextFixedCardSpecificUpperCompletedCount += 1;
  }
  return bestFixedSlotUpperBound;
}

export function getMedleyContextCoefficientPotential(coefficientUpperByCardId: Map<number, number>): number {
  let bestCoefficient = Number.NEGATIVE_INFINITY;
  for (const coefficient of coefficientUpperByCardId.values()) {
    bestCoefficient = Math.max(bestCoefficient, coefficient);
  }
  return bestCoefficient;
}

export function setMedleyMaxMapValue(map: Map<number, number>, key: number, value: number): void {
  if (!Number.isFinite(value)) {
    return;
  }
  map.set(key, Math.max(map.get(key) ?? Number.NEGATIVE_INFINITY, value));
}

export function buildMedleyContextCardBoundPowerUpper(
  slot: MedleySlotSearch,
  context: MedleySkillContextUpper,
  bannedCardIds: Set<number>,
): Map<number, number> {
  const bestPowerByCharacter = new Map<number, number>();
  for (const card of slot.searchCards) {
    if (bannedCardIds.has(card.cardId) || !medleyCardMatchesSkillContext(card, context)) {
      continue;
    }
    bestPowerByCharacter.set(
      card.characterId,
      Math.max(bestPowerByCharacter.get(card.characterId) ?? Number.NEGATIVE_INFINITY, card.effectivePower),
    );
  }

  const sortedCharacterPowers = [...bestPowerByCharacter.entries()]
    .sort((left, right) => right[1] - left[1]);
  const powerUpperByCardId = new Map<number, number>();
  for (const card of slot.searchCards) {
    if (bannedCardIds.has(card.cardId) || !medleyCardMatchesSkillContext(card, context)) {
      continue;
    }
    let otherPower = 0;
    let otherCharacterCount = 0;
    for (const [characterId, power] of sortedCharacterPowers) {
      if (characterId === card.characterId) {
        continue;
      }
      otherPower += power;
      otherCharacterCount += 1;
      if (otherCharacterCount === MEDLEY_TEAM_SIZE - 1) {
        break;
      }
    }
    if (otherCharacterCount === MEDLEY_TEAM_SIZE - 1) {
      powerUpperByCardId.set(card.cardId, card.effectivePower + otherPower);
    }
  }
  return powerUpperByCardId;
}

export function buildMedleyContextBoundUpperGroup(
  slot: MedleySlotSearch,
  context: MedleySkillContextUpper,
  coefficientUpperByCardId: Map<number, number>,
  bannedCardIds: Set<number>,
): MedleyContextBoundUpperGroup {
  const averageRateUpperByCardId = new Map<number, number>();
  const leaderRateUpperByCardId = new Map<number, number>();
  const averageScoreUpperByCardId = new Map<number, number>();
  const leaderScoreUpperByCardId = new Map<number, number>();
  const powerUpperByCardId = buildMedleyContextCardBoundPowerUpper(slot, context, bannedCardIds);
  const floorAwareCache = new Map<string, { averageScore: number; leaderScore: number }>();

  for (const card of slot.searchCards) {
    if (bannedCardIds.has(card.cardId) || !medleyCardMatchesSkillContext(card, context)) {
      continue;
    }
    const cardBoundPowerUpper = powerUpperByCardId.get(card.cardId);
    if (cardBoundPowerUpper === undefined || !Number.isFinite(cardBoundPowerUpper)) {
      continue;
    }
    const averageRate = getMedleyCardSkillAverageRateForContext(card, context.mode);
    const leaderRate = getMedleyCardSkillLeaderRateForContext(card, context.mode);
    const skillScoreUpper = estimateMedleyContextBoundSkillScoreUpper(
      slot,
      card,
      cardBoundPowerUpper,
      averageRate,
      leaderRate,
      floorAwareCache,
    );
    averageRateUpperByCardId.set(card.cardId, averageRate);
    leaderRateUpperByCardId.set(card.cardId, leaderRate);
    averageScoreUpperByCardId.set(
      card.cardId,
      card.effectivePower * slot.baseScoreRatePerPower
        + skillScoreUpper.averageScore,
    );
    leaderScoreUpperByCardId.set(
      card.cardId,
      Math.max(0, skillScoreUpper.leaderTotalScore - skillScoreUpper.averageScore),
    );
  }

  return {
    coefficientUpperByCardId,
    averageRateUpperByCardId,
    leaderRateUpperByCardId,
    averageScoreUpperByCardId,
    leaderScoreUpperByCardId,
  };
}

export function mergeMedleyContextBoundUpperGroups(
  groups: MedleyContextBoundUpperGroup[],
): MedleyContextBoundUpperGroup {
  const merged: MedleyContextBoundUpperGroup = {
    coefficientUpperByCardId: new Map<number, number>(),
    averageRateUpperByCardId: new Map<number, number>(),
    leaderRateUpperByCardId: new Map<number, number>(),
    averageScoreUpperByCardId: new Map<number, number>(),
    leaderScoreUpperByCardId: new Map<number, number>(),
  };

  for (const group of groups) {
    for (const [cardId, coefficient] of group.coefficientUpperByCardId) {
      setMedleyMaxMapValue(merged.coefficientUpperByCardId, cardId, coefficient);
    }
    for (const [cardId, averageRate] of group.averageRateUpperByCardId) {
      setMedleyMaxMapValue(merged.averageRateUpperByCardId, cardId, averageRate);
    }
    for (const [cardId, leaderRate] of group.leaderRateUpperByCardId) {
      setMedleyMaxMapValue(merged.leaderRateUpperByCardId, cardId, leaderRate);
    }
    for (const [cardId, averageScore] of group.averageScoreUpperByCardId) {
      setMedleyMaxMapValue(merged.averageScoreUpperByCardId, cardId, averageScore);
    }
    for (const [cardId, leaderScore] of group.leaderScoreUpperByCardId) {
      setMedleyMaxMapValue(merged.leaderScoreUpperByCardId, cardId, leaderScore);
    }
  }

  return merged;
}

export function buildMedleyContextGroupCardSpecificCoefficientUppers(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
): Array<Map<number, number>> {
  return buildMedleyContextBoundUpperGroups(slot, bannedCardIds)
    .map((group) => group.coefficientUpperByCardId);
}

export function buildMedleyContextBoundUpperGroups(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
): MedleyContextBoundUpperGroup[] {
  const contextEntries = buildMedleySkillContextUppers(slot, [])
    .map((context) => {
      const { leaderComboRateByCharacter, sortedAverageRatesByCharacter } = buildMedleyContextFixedSkillContext(
        slot,
        context,
        bannedCardIds,
      );
      if (sortedAverageRatesByCharacter.length < MEDLEY_TEAM_SIZE) {
        return null;
      }
      const coefficientUpperByCardId = buildMedleyContextFixedCardSpecificCoefficientUpper(
        slot,
        context,
        sortedAverageRatesByCharacter,
        leaderComboRateByCharacter,
        bannedCardIds,
      );
      const potential = getMedleyContextCoefficientPotential(coefficientUpperByCardId);
      const group = buildMedleyContextBoundUpperGroup(slot, context, coefficientUpperByCardId, bannedCardIds);
      return Number.isFinite(potential)
        ? { group, potential }
        : null;
    })
    .filter((entry): entry is { group: MedleyContextBoundUpperGroup; potential: number } => entry !== null)
    .sort((left, right) => right.potential - left.potential);

  const groups: MedleyContextBoundUpperGroup[][] = contextEntries
    .slice(0, MEDLEY_CONTEXT_GROUP_CARD_SPECIFIC_TOP_COUNT)
    .map((entry) => [entry.group]);
  const remainingContexts = contextEntries.slice(MEDLEY_CONTEXT_GROUP_CARD_SPECIFIC_TOP_COUNT);
  for (let index = 0; index < remainingContexts.length; index += MEDLEY_CONTEXT_GROUP_CARD_SPECIFIC_TAIL_GROUP_SIZE) {
    groups.push(
      remainingContexts
        .slice(index, index + MEDLEY_CONTEXT_GROUP_CARD_SPECIFIC_TAIL_GROUP_SIZE)
        .map((entry) => entry.group),
    );
  }

  return groups.map(mergeMedleyContextBoundUpperGroups);
}

export function estimateMedleyCapacityContextGroupCardSpecificCoefficientScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  if (remainingSlotIndices.length !== MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextGroupCardSpecificUpperCallCount += 1;
  }

  const coefficientGroupsBySlot = remainingSlotIndices.map((slotIndex) => (
    buildMedleyContextGroupCardSpecificCoefficientUppers(slots[slotIndex], bannedCardIds)
  ));
  if (coefficientGroupsBySlot.some((groups) => groups.length === 0)) {
    return null;
  }

  let combinationCount = 1;
  for (const groups of coefficientGroupsBySlot) {
    combinationCount *= groups.length;
  }
  if (profiling) {
    profiling.capacityContextGroupCardSpecificUpperGroupCount = combinationCount;
  }

  let upperBound = Number.NEGATIVE_INFINITY;
  for (const firstSlotCoefficients of coefficientGroupsBySlot[0]) {
    for (const secondSlotCoefficients of coefficientGroupsBySlot[1]) {
      for (const thirdSlotCoefficients of coefficientGroupsBySlot[2]) {
        const estimate = estimateMedleyCapacityCardSpecificCoefficientScoreUpperBound(
          remainingSlotIndices,
          cardsByCharacter,
          [firstSlotCoefficients, secondSlotCoefficients, thirdSlotCoefficients],
        );
        if (estimate !== null && Number.isFinite(estimate)) {
          upperBound = Math.max(upperBound, estimate);
        }
      }
    }
  }

  if (!Number.isFinite(upperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextGroupCardSpecificUpperCompletedCount += 1;
  }
  return upperBound;
}

export function estimateMedleyCapacityContextBoundLagrangianScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): MedleyCapacityWeightedUpperEstimate | null {
  if (remainingSlotIndices.length !== MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextBoundLagrangianUpperCallCount += 1;
  }

  const groupsBySlot = remainingSlotIndices.map((slotIndex) => (
    buildMedleyContextBoundUpperGroups(slots[slotIndex], bannedCardIds)
  ));
  if (groupsBySlot.some((groups) => groups.length === 0)) {
    return null;
  }

  let combinationCount = 1;
  for (const groups of groupsBySlot) {
    combinationCount *= groups.length;
  }
  if (profiling) {
    profiling.capacityContextBoundLagrangianUpperGroupCount = combinationCount;
  }
  if (combinationCount > MEDLEY_CONTEXT_BOUND_LAGRANGIAN_MAX_GROUP_COMBINATIONS) {
    return null;
  }

  let upperBound = Number.NEGATIVE_INFINITY;
  let bestWeight = 0;
  for (const firstSlotUpper of groupsBySlot[0]) {
    for (const secondSlotUpper of groupsBySlot[1]) {
      for (const thirdSlotUpper of groupsBySlot[2]) {
        const contextBoundUpperBySlot = [firstSlotUpper, secondSlotUpper, thirdSlotUpper];
        let combinationUpperBound = Number.POSITIVE_INFINITY;
        let combinationBestWeight = 0;
        for (const coefficientWeight of MEDLEY_CONTEXT_BOUND_LAGRANGIAN_WEIGHTS) {
          const estimate = estimateMedleyCapacityContextBoundWeightedScoreUpperBound(
            remainingSlotIndices,
            cardsByCharacter,
            contextBoundUpperBySlot,
            coefficientWeight,
          );
          if (Number.isFinite(estimate) && estimate < combinationUpperBound) {
            combinationUpperBound = estimate;
            combinationBestWeight = coefficientWeight;
          }
        }
        if (Number.isFinite(combinationUpperBound) && combinationUpperBound > upperBound) {
          upperBound = combinationUpperBound;
          bestWeight = combinationBestWeight;
        }
      }
    }
  }

  if (!Number.isFinite(upperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextBoundLagrangianUpperCompletedCount += 1;
  }
  return {
    upperBound,
    weight: bestWeight,
  };
}

export function estimateMedleyContextBoundMcCormickSlotBounds(
  slot: MedleySlotSearch,
  contextBoundUpper: MedleyContextBoundUpperGroup,
): MedleyContextBoundMcCormickSlotBounds | null {
  const minimumPowerByCharacter = new Map<number, number>();
  const maximumPowerByCharacter = new Map<number, number>();
  const skillRateOptionsByCharacter = new Map<number, {
    minimumAverageRate: number;
    maximumAverageRate: number;
    minimumLeaderRate: number;
    maximumLeaderRate: number;
    maximumLeaderComboRate: number;
  }>();

  for (const card of slot.searchCards) {
    if (!contextBoundUpper.averageRateUpperByCardId.has(card.cardId)) {
      continue;
    }
    minimumPowerByCharacter.set(
      card.characterId,
      Math.min(minimumPowerByCharacter.get(card.characterId) ?? Number.POSITIVE_INFINITY, card.effectivePower),
    );
    maximumPowerByCharacter.set(
      card.characterId,
      Math.max(maximumPowerByCharacter.get(card.characterId) ?? Number.NEGATIVE_INFINITY, card.effectivePower),
    );
    const averageRate = contextBoundUpper.averageRateUpperByCardId.get(card.cardId) ?? 0;
    const leaderRate = contextBoundUpper.leaderRateUpperByCardId.get(card.cardId) ?? 0;
    const option = skillRateOptionsByCharacter.get(card.characterId) ?? {
      minimumAverageRate: Number.POSITIVE_INFINITY,
      maximumAverageRate: Number.NEGATIVE_INFINITY,
      minimumLeaderRate: Number.POSITIVE_INFINITY,
      maximumLeaderRate: Number.NEGATIVE_INFINITY,
      maximumLeaderComboRate: Number.NEGATIVE_INFINITY,
    };
    option.minimumAverageRate = Math.min(option.minimumAverageRate, averageRate);
    option.maximumAverageRate = Math.max(option.maximumAverageRate, averageRate);
    option.minimumLeaderRate = Math.min(option.minimumLeaderRate, leaderRate);
    option.maximumLeaderRate = Math.max(option.maximumLeaderRate, leaderRate);
    option.maximumLeaderComboRate = Math.max(option.maximumLeaderComboRate, averageRate + leaderRate);
    skillRateOptionsByCharacter.set(card.characterId, option);
  }

  if (
    minimumPowerByCharacter.size < MEDLEY_TEAM_SIZE
    || maximumPowerByCharacter.size < MEDLEY_TEAM_SIZE
    || skillRateOptionsByCharacter.size < MEDLEY_TEAM_SIZE
  ) {
    return null;
  }

  const powerLowerBound = [...minimumPowerByCharacter.values()]
    .sort((left, right) => left - right)
    .slice(0, MEDLEY_TEAM_SIZE)
    .reduce((sum, value) => sum + value, 0);
  const powerUpperBound = [...maximumPowerByCharacter.values()]
    .sort((left, right) => right - left)
    .slice(0, MEDLEY_TEAM_SIZE)
    .reduce((sum, value) => sum + value, 0);
  const skillRateBounds = estimateMedleyContextBoundSkillRateBounds(skillRateOptionsByCharacter);
  if (skillRateBounds === null) {
    return null;
  }

  if (
    !Number.isFinite(powerLowerBound)
    || !Number.isFinite(powerUpperBound)
    || !Number.isFinite(skillRateBounds.skillLowerBound)
    || !Number.isFinite(skillRateBounds.skillUpperBound)
  ) {
    return null;
  }

  return {
    powerLowerBound,
    powerUpperBound,
    averageRateLowerBound: skillRateBounds.averageLowerBound,
    averageRateUpperBound: skillRateBounds.averageUpperBound,
    leaderRateLowerBound: skillRateBounds.leaderLowerBound,
    leaderRateUpperBound: skillRateBounds.leaderUpperBound,
    skillRateLowerBound: skillRateBounds.skillLowerBound,
    skillRateUpperBound: skillRateBounds.skillUpperBound,
  };
}

export function estimateMedleyContextBoundSkillRateBounds(
  optionsByCharacter: Map<number, {
    minimumAverageRate: number;
    maximumAverageRate: number;
    minimumLeaderRate: number;
    maximumLeaderRate: number;
    maximumLeaderComboRate: number;
  }>,
): MedleyContextBoundSkillRateBounds | null {
  const minAverageStates = new Float64Array(MEDLEY_TEAM_SIZE + 1);
  minAverageStates.fill(Number.POSITIVE_INFINITY);
  minAverageStates[0] = 0;
  const maxAverageStates = new Float64Array(MEDLEY_TEAM_SIZE + 1);
  maxAverageStates.fill(Number.NEGATIVE_INFINITY);
  maxAverageStates[0] = 0;

  const maxSkillStates = new Float64Array((MEDLEY_TEAM_SIZE + 1) * 2);
  maxSkillStates.fill(Number.NEGATIVE_INFINITY);
  maxSkillStates[0] = 0;
  let leaderUpperBound = 0;
  const minimumLeaderRatesByCharacter: number[] = [];

  for (const option of optionsByCharacter.values()) {
    const nextMinAverageStates = minAverageStates.slice();
    const nextMaxAverageStates = maxAverageStates.slice();
    const nextMaxSkillStates = maxSkillStates.slice();
    if (Number.isFinite(option.minimumLeaderRate)) {
      minimumLeaderRatesByCharacter.push(option.minimumLeaderRate);
    }
    leaderUpperBound = Math.max(leaderUpperBound, option.maximumLeaderRate);

    for (let count = 0; count < MEDLEY_TEAM_SIZE; count += 1) {
      const currentMinAverage = minAverageStates[count];
      if (Number.isFinite(currentMinAverage) && Number.isFinite(option.minimumAverageRate)) {
        nextMinAverageStates[count + 1] = Math.min(
          nextMinAverageStates[count + 1],
          currentMinAverage + option.minimumAverageRate,
        );
      }
      const currentMaxAverage = maxAverageStates[count];
      if (Number.isFinite(currentMaxAverage) && Number.isFinite(option.maximumAverageRate)) {
        nextMaxAverageStates[count + 1] = Math.max(
          nextMaxAverageStates[count + 1],
          currentMaxAverage + option.maximumAverageRate,
        );
      }

      for (let leaderUsed = 0; leaderUsed <= 1; leaderUsed += 1) {
        const currentMaxSkill = maxSkillStates[count * 2 + leaderUsed];
        if (!Number.isFinite(currentMaxSkill)) {
          continue;
        }
        if (Number.isFinite(option.maximumAverageRate)) {
          const nonLeaderIndex = (count + 1) * 2 + leaderUsed;
          nextMaxSkillStates[nonLeaderIndex] = Math.max(
            nextMaxSkillStates[nonLeaderIndex],
            currentMaxSkill + option.maximumAverageRate,
          );
        }
        if (leaderUsed === 0 && Number.isFinite(option.maximumLeaderComboRate)) {
          const leaderIndex = (count + 1) * 2 + 1;
          nextMaxSkillStates[leaderIndex] = Math.max(
            nextMaxSkillStates[leaderIndex],
            currentMaxSkill + option.maximumLeaderComboRate,
          );
        }
      }
    }

    minAverageStates.set(nextMinAverageStates);
    maxAverageStates.set(nextMaxAverageStates);
    maxSkillStates.set(nextMaxSkillStates);
  }

  const averageLowerBound = minAverageStates[MEDLEY_TEAM_SIZE];
  const averageUpperBound = maxAverageStates[MEDLEY_TEAM_SIZE];
  const skillUpperBound = maxSkillStates[MEDLEY_TEAM_SIZE * 2 + 1];
  minimumLeaderRatesByCharacter.sort((left, right) => left - right);
  const leaderLowerBound = minimumLeaderRatesByCharacter.length >= MEDLEY_TEAM_SIZE
    ? minimumLeaderRatesByCharacter[MEDLEY_TEAM_SIZE - 1]
    : Number.POSITIVE_INFINITY;
  const skillLowerBound = averageLowerBound + leaderLowerBound;
  return (
    Number.isFinite(averageLowerBound)
    && Number.isFinite(averageUpperBound)
    && Number.isFinite(leaderUpperBound)
    && Number.isFinite(skillLowerBound)
    && Number.isFinite(skillUpperBound)
  )
    ? {
      averageLowerBound,
      averageUpperBound,
      leaderLowerBound,
      leaderUpperBound,
      skillLowerBound,
      skillUpperBound,
    }
    : null;
}

export function estimateMedleyCapacityContextBoundMcCormickScoreUpperBoundForCombination(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
  slotBounds: MedleyContextBoundMcCormickSlotBounds[],
  constraintMask: number,
): number | null {
  const slotCount = remainingSlotIndices.length;
  const maskCount = 1 << slotCount;
  const leaderMaskCount = 1 << slotCount;
  const targetLeaderMask = leaderMaskCount - 1;
  const transition = getMedleyCapacityTransition(slotCount);
  const powerCoefficientBySlot: number[] = [];
  const skillMultiplierBySlot: number[] = [];
  let constantTerm = 0;

  for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
    const slot = slots[remainingSlotIndices[slotPosition]];
    const bounds = slotBounds[slotPosition];
    if ((constraintMask & (1 << slotPosition)) !== 0) {
      powerCoefficientBySlot.push(slot.baseScoreRatePerPower + bounds.skillRateUpperBound);
      skillMultiplierBySlot.push(bounds.powerLowerBound);
      constantTerm -= bounds.powerLowerBound * bounds.skillRateUpperBound;
    } else {
      powerCoefficientBySlot.push(slot.baseScoreRatePerPower + bounds.skillRateLowerBound);
      skillMultiplierBySlot.push(bounds.powerUpperBound);
      constantTerm -= bounds.powerUpperBound * bounds.skillRateLowerBound;
    }
  }

  let states = new Float64Array(transition.stateCount * leaderMaskCount);
  states.fill(Number.NEGATIVE_INFINITY);
  states[0] = 0;

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptions = new Float64Array(maskCount * leaderMaskCount);
    characterOptions.fill(Number.NEGATIVE_INFINITY);
    characterOptions[0] = 0;

    for (const slotCards of cardsById.values()) {
      const nextCharacterOptions = characterOptions.slice();
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
          const currentValue = characterOptions[mask * leaderMaskCount + leaderMask];
          if (!Number.isFinite(currentValue)) {
            continue;
          }
          for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
            if ((mask & (1 << slotPosition)) !== 0) {
              continue;
            }
            const card = slotCards[slotPosition];
            if (!card) {
              continue;
            }
            const contextBoundUpper = contextBoundUpperBySlot[slotPosition];
            const averageRate = contextBoundUpper.averageRateUpperByCardId.get(card.cardId);
            if (averageRate === undefined || !Number.isFinite(averageRate)) {
              continue;
            }

            const nextMask = mask | (1 << slotPosition);
            const baseContribution = card.effectivePower * powerCoefficientBySlot[slotPosition]
              + skillMultiplierBySlot[slotPosition] * averageRate;
            const nextIndex = nextMask * leaderMaskCount + leaderMask;
            nextCharacterOptions[nextIndex] = Math.max(
              nextCharacterOptions[nextIndex],
              currentValue + baseContribution,
            );

            const leaderBit = 1 << slotPosition;
            if ((leaderMask & leaderBit) === 0) {
              const leaderRate = contextBoundUpper.leaderRateUpperByCardId.get(card.cardId);
              if (leaderRate === undefined || !Number.isFinite(leaderRate)) {
                continue;
              }
              const nextLeaderMask = leaderMask | leaderBit;
              const leaderIndex = nextMask * leaderMaskCount + nextLeaderMask;
              nextCharacterOptions[leaderIndex] = Math.max(
                nextCharacterOptions[leaderIndex],
                currentValue + baseContribution + skillMultiplierBySlot[slotPosition] * leaderRate,
              );
            }
          }
        }
      }
      characterOptions = nextCharacterOptions;
    }

    const nextStates = states.slice();
    for (let stateIndex = 0; stateIndex < transition.stateCount; stateIndex += 1) {
      for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
        const currentValue = states[stateIndex * leaderMaskCount + leaderMask];
        if (!Number.isFinite(currentValue)) {
          continue;
        }
        for (let characterMask = 1; characterMask < maskCount; characterMask += 1) {
          const nextStateIndex = transition.nextIndexByMask[stateIndex * maskCount + characterMask];
          if (nextStateIndex < 0) {
            continue;
          }
          for (let characterLeaderMask = 0; characterLeaderMask < leaderMaskCount; characterLeaderMask += 1) {
            if (
              (characterLeaderMask & ~characterMask) !== 0
              || (leaderMask & characterLeaderMask) !== 0
            ) {
              continue;
            }
            const characterValue = characterOptions[characterMask * leaderMaskCount + characterLeaderMask];
            if (!Number.isFinite(characterValue)) {
              continue;
            }
            const nextLeaderMask = leaderMask | characterLeaderMask;
            const nextIndex = nextStateIndex * leaderMaskCount + nextLeaderMask;
            nextStates[nextIndex] = Math.max(nextStates[nextIndex], currentValue + characterValue);
          }
        }
      }
    }
    states = nextStates;
  }

  const upperBound = states[transition.targetIndex * leaderMaskCount + targetLeaderMask] + constantTerm;
  return Number.isFinite(upperBound) ? upperBound : null;
}

export function estimateMedleyCapacityContextBoundLinearScoreUpperBound(
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
  powerCoefficientBySlot: number[],
  averageRateMultiplierBySlot: number[],
  leaderRateMultiplierBySlot: number[],
  constantTerm: number,
): number | null {
  const slotCount = remainingSlotIndices.length;
  const maskCount = 1 << slotCount;
  const leaderMaskCount = 1 << slotCount;
  const targetLeaderMask = leaderMaskCount - 1;
  const transition = getMedleyCapacityTransition(slotCount);
  let states = new Float64Array(transition.stateCount * leaderMaskCount);
  states.fill(Number.NEGATIVE_INFINITY);
  states[0] = 0;

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptions = new Float64Array(maskCount * leaderMaskCount);
    characterOptions.fill(Number.NEGATIVE_INFINITY);
    characterOptions[0] = 0;

    for (const slotCards of cardsById.values()) {
      const nextCharacterOptions = characterOptions.slice();
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
          const currentValue = characterOptions[mask * leaderMaskCount + leaderMask];
          if (!Number.isFinite(currentValue)) {
            continue;
          }
          for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
            if ((mask & (1 << slotPosition)) !== 0) {
              continue;
            }
            const card = slotCards[slotPosition];
            if (!card) {
              continue;
            }
            const contextBoundUpper = contextBoundUpperBySlot[slotPosition];
            const averageRate = contextBoundUpper.averageRateUpperByCardId.get(card.cardId);
            if (averageRate === undefined || !Number.isFinite(averageRate)) {
              continue;
            }

            const nextMask = mask | (1 << slotPosition);
            const baseContribution = card.effectivePower * powerCoefficientBySlot[slotPosition]
              + averageRateMultiplierBySlot[slotPosition] * averageRate;
            const nextIndex = nextMask * leaderMaskCount + leaderMask;
            nextCharacterOptions[nextIndex] = Math.max(
              nextCharacterOptions[nextIndex],
              currentValue + baseContribution,
            );

            const leaderBit = 1 << slotPosition;
            if ((leaderMask & leaderBit) === 0) {
              const leaderRate = contextBoundUpper.leaderRateUpperByCardId.get(card.cardId);
              if (leaderRate === undefined || !Number.isFinite(leaderRate)) {
                continue;
              }
              const nextLeaderMask = leaderMask | leaderBit;
              const leaderIndex = nextMask * leaderMaskCount + nextLeaderMask;
              nextCharacterOptions[leaderIndex] = Math.max(
                nextCharacterOptions[leaderIndex],
                currentValue + baseContribution + leaderRateMultiplierBySlot[slotPosition] * leaderRate,
              );
            }
          }
        }
      }
      characterOptions = nextCharacterOptions;
    }

    const nextStates = states.slice();
    for (let stateIndex = 0; stateIndex < transition.stateCount; stateIndex += 1) {
      for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
        const currentValue = states[stateIndex * leaderMaskCount + leaderMask];
        if (!Number.isFinite(currentValue)) {
          continue;
        }
        for (let characterMask = 1; characterMask < maskCount; characterMask += 1) {
          const nextStateIndex = transition.nextIndexByMask[stateIndex * maskCount + characterMask];
          if (nextStateIndex < 0) {
            continue;
          }
          for (let characterLeaderMask = 0; characterLeaderMask < leaderMaskCount; characterLeaderMask += 1) {
            if (
              (characterLeaderMask & ~characterMask) !== 0
              || (leaderMask & characterLeaderMask) !== 0
            ) {
              continue;
            }
            const characterValue = characterOptions[characterMask * leaderMaskCount + characterLeaderMask];
            if (!Number.isFinite(characterValue)) {
              continue;
            }
            const nextLeaderMask = leaderMask | characterLeaderMask;
            const nextIndex = nextStateIndex * leaderMaskCount + nextLeaderMask;
            nextStates[nextIndex] = Math.max(nextStates[nextIndex], currentValue + characterValue);
          }
        }
      }
    }
    states = nextStates;
  }

  const upperBound = states[transition.targetIndex * leaderMaskCount + targetLeaderMask] + constantTerm;
  return Number.isFinite(upperBound) ? upperBound : null;
}

export function estimateMedleyCapacityContextBoundSplitSkillMcCormickScoreUpperBoundForCombination(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
  slotBounds: MedleyContextBoundMcCormickSlotBounds[],
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  if (profiling) {
    profiling.capacityContextBoundSplitSkillMcCormickUpperCallCount += 1;
  }
  const slotCount = remainingSlotIndices.length;
  const maskCount = 1 << slotCount;
  let upperBound = Number.POSITIVE_INFINITY;

  for (let averageConstraintMask = 0; averageConstraintMask < maskCount; averageConstraintMask += 1) {
    for (let leaderConstraintMask = 0; leaderConstraintMask < maskCount; leaderConstraintMask += 1) {
      const powerCoefficientBySlot: number[] = [];
      const averageRateMultiplierBySlot: number[] = [];
      const leaderRateMultiplierBySlot: number[] = [];
      let constantTerm = 0;
      for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
        const slot = slots[remainingSlotIndices[slotPosition]];
        const bounds = slotBounds[slotPosition];
        let powerCoefficient = slot.baseScoreRatePerPower;
        let averageRateMultiplier = 0;
        let leaderRateMultiplier = 0;

        if ((averageConstraintMask & (1 << slotPosition)) !== 0) {
          powerCoefficient += bounds.averageRateUpperBound;
          averageRateMultiplier += bounds.powerLowerBound;
          constantTerm -= bounds.powerLowerBound * bounds.averageRateUpperBound;
        } else {
          powerCoefficient += bounds.averageRateLowerBound;
          averageRateMultiplier += bounds.powerUpperBound;
          constantTerm -= bounds.powerUpperBound * bounds.averageRateLowerBound;
        }

        if ((leaderConstraintMask & (1 << slotPosition)) !== 0) {
          powerCoefficient += bounds.leaderRateUpperBound;
          leaderRateMultiplier += bounds.powerLowerBound;
          constantTerm -= bounds.powerLowerBound * bounds.leaderRateUpperBound;
        } else {
          powerCoefficient += bounds.leaderRateLowerBound;
          leaderRateMultiplier += bounds.powerUpperBound;
          constantTerm -= bounds.powerUpperBound * bounds.leaderRateLowerBound;
        }

        powerCoefficientBySlot.push(powerCoefficient);
        averageRateMultiplierBySlot.push(averageRateMultiplier);
        leaderRateMultiplierBySlot.push(leaderRateMultiplier);
      }

      const estimate = estimateMedleyCapacityContextBoundLinearScoreUpperBound(
        remainingSlotIndices,
        cardsByCharacter,
        contextBoundUpperBySlot,
        powerCoefficientBySlot,
        averageRateMultiplierBySlot,
        leaderRateMultiplierBySlot,
        constantTerm,
      );
      if (estimate !== null && Number.isFinite(estimate)) {
        upperBound = Math.min(upperBound, estimate);
      }
    }
  }

  if (!Number.isFinite(upperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextBoundSplitSkillMcCormickUpperCompletedCount += 1;
  }
  return upperBound;
}

export function addMedleyCapacitySkillSplitState(
  states: Map<number, number>,
  splitSkillRate: number,
  score: number,
): void {
  const currentScore = states.get(splitSkillRate);
  if (currentScore === undefined || score > currentScore) {
    states.set(splitSkillRate, score);
  }
}

export function cloneMedleyCapacitySkillSplitStateMap(states: Map<number, number>): Map<number, number> {
  return new Map(states);
}

export function estimateMedleyCapacityContextBoundTeamSharedCoefficientUpperBoundForInterval(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
  slotBounds: MedleyContextBoundMcCormickSlotBounds[],
  splitSlotPosition: number,
  splitSkillLowerBound: number,
  splitSkillUpperBound: number,
  constraintMask: number,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  const slotCount = remainingSlotIndices.length;
  const maskCount = 1 << slotCount;
  const leaderMaskCount = 1 << slotCount;
  const targetLeaderMask = leaderMaskCount - 1;
  const transition = getMedleyCapacityTransition(slotCount);
  const powerCoefficientBySlot: number[] = [];
  const skillMultiplierBySlot: number[] = [];
  let constantTerm = 0;
  let processedStateCount = 0;

  const abort = (): null => {
    if (profiling) {
      profiling.capacityTeamSharedCoefficientUpperAbortCount += 1;
      profiling.capacityTeamSharedCoefficientUpperStateCount += processedStateCount;
    }
    return null;
  };
  const accountState = (): boolean => {
    processedStateCount += 1;
    const totalStateCount = processedStateCount
      + (profiling?.capacityTeamSharedCoefficientUpperStateCount ?? 0);
    return (
      processedStateCount <= MEDLEY_TEAM_SHARED_COEFFICIENT_STATE_BUDGET
      && totalStateCount <= MEDLEY_TEAM_SHARED_COEFFICIENT_GLOBAL_STATE_BUDGET
    );
  };

  for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
    const slot = slots[remainingSlotIndices[slotPosition]];
    const bounds = slotBounds[slotPosition];
    const skillLowerBound = slotPosition === splitSlotPosition
      ? splitSkillLowerBound
      : bounds.skillRateLowerBound;
    const skillUpperBound = slotPosition === splitSlotPosition
      ? splitSkillUpperBound
      : bounds.skillRateUpperBound;

    if ((constraintMask & (1 << slotPosition)) !== 0) {
      powerCoefficientBySlot.push(slot.baseScoreRatePerPower + skillUpperBound);
      skillMultiplierBySlot.push(bounds.powerLowerBound);
      constantTerm -= bounds.powerLowerBound * skillUpperBound;
    } else {
      powerCoefficientBySlot.push(slot.baseScoreRatePerPower + skillLowerBound);
      skillMultiplierBySlot.push(bounds.powerUpperBound);
      constantTerm -= bounds.powerUpperBound * skillLowerBound;
    }
  }

  let statesByIndexAndLeaderMask: Array<Map<number, number>> = Array.from(
    { length: transition.stateCount * leaderMaskCount },
    () => new Map<number, number>(),
  );
  statesByIndexAndLeaderMask[0].set(0, 0);

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptions: Array<Map<number, number>> = Array.from(
      { length: maskCount * leaderMaskCount },
      () => new Map<number, number>(),
    );
    characterOptions[0].set(0, 0);

    for (const slotCards of cardsById.values()) {
      const nextCharacterOptions = characterOptions.map(cloneMedleyCapacitySkillSplitStateMap);
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
          const currentStates = characterOptions[mask * leaderMaskCount + leaderMask];
          if (currentStates.size === 0) {
            continue;
          }
          for (const [splitSkillRate, currentValue] of currentStates.entries()) {
            for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
              if ((mask & (1 << slotPosition)) !== 0) {
                continue;
              }
              const card = slotCards[slotPosition];
              if (!card) {
                continue;
              }
              const contextBoundUpper = contextBoundUpperBySlot[slotPosition];
              const averageRate = contextBoundUpper.averageRateUpperByCardId.get(card.cardId);
              if (averageRate === undefined || !Number.isFinite(averageRate)) {
                continue;
              }

              const nextMask = mask | (1 << slotPosition);
              const averageSplitSkillRate = slotPosition === splitSlotPosition
                ? splitSkillRate + averageRate
                : splitSkillRate;
              const baseContribution = card.effectivePower * powerCoefficientBySlot[slotPosition]
                + skillMultiplierBySlot[slotPosition] * averageRate;
              if (!accountState()) {
                return abort();
              }
              addMedleyCapacitySkillSplitState(
                nextCharacterOptions[nextMask * leaderMaskCount + leaderMask],
                averageSplitSkillRate,
                currentValue + baseContribution,
              );

              const leaderBit = 1 << slotPosition;
              if ((leaderMask & leaderBit) === 0) {
                const leaderRate = contextBoundUpper.leaderRateUpperByCardId.get(card.cardId);
                if (leaderRate === undefined || !Number.isFinite(leaderRate)) {
                  continue;
                }
                const nextLeaderMask = leaderMask | leaderBit;
                const leaderSplitSkillRate = slotPosition === splitSlotPosition
                  ? splitSkillRate + averageRate + leaderRate
                  : splitSkillRate;
                if (!accountState()) {
                  return abort();
                }
                addMedleyCapacitySkillSplitState(
                  nextCharacterOptions[nextMask * leaderMaskCount + nextLeaderMask],
                  leaderSplitSkillRate,
                  currentValue + baseContribution + skillMultiplierBySlot[slotPosition] * leaderRate,
                );
              }
            }
          }
        }
      }
      characterOptions = nextCharacterOptions;
    }

    const nextStatesByIndexAndLeaderMask = statesByIndexAndLeaderMask
      .map(cloneMedleyCapacitySkillSplitStateMap);
    for (let stateIndex = 0; stateIndex < transition.stateCount; stateIndex += 1) {
      for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
        const states = statesByIndexAndLeaderMask[stateIndex * leaderMaskCount + leaderMask];
        if (states.size === 0) {
          continue;
        }
        for (let characterMask = 1; characterMask < maskCount; characterMask += 1) {
          const nextStateIndex = transition.nextIndexByMask[stateIndex * maskCount + characterMask];
          if (nextStateIndex < 0) {
            continue;
          }
          for (let characterLeaderMask = 0; characterLeaderMask < leaderMaskCount; characterLeaderMask += 1) {
            if (
              (characterLeaderMask & ~characterMask) !== 0
              || (leaderMask & characterLeaderMask) !== 0
            ) {
              continue;
            }
            const options = characterOptions[characterMask * leaderMaskCount + characterLeaderMask];
            if (options.size === 0) {
              continue;
            }
            const nextLeaderMask = leaderMask | characterLeaderMask;
            const nextStates = nextStatesByIndexAndLeaderMask[nextStateIndex * leaderMaskCount + nextLeaderMask];
            for (const [splitSkillRate, currentValue] of states.entries()) {
              for (const [optionSplitSkillRate, optionValue] of options.entries()) {
                if (!accountState()) {
                  return abort();
                }
                addMedleyCapacitySkillSplitState(
                  nextStates,
                  splitSkillRate + optionSplitSkillRate,
                  currentValue + optionValue,
                );
              }
            }
          }
        }
      }
    }
    statesByIndexAndLeaderMask = nextStatesByIndexAndLeaderMask;
  }

  const targetStates = statesByIndexAndLeaderMask[transition.targetIndex * leaderMaskCount + targetLeaderMask];
  let upperBound = Number.NEGATIVE_INFINITY;
  const epsilon = 1e-9;
  for (const [splitSkillRate, score] of targetStates.entries()) {
    if (splitSkillRate + epsilon < splitSkillLowerBound || splitSkillRate - epsilon > splitSkillUpperBound) {
      continue;
    }
    upperBound = Math.max(upperBound, score + constantTerm);
  }
  if (profiling) {
    profiling.capacityTeamSharedCoefficientUpperStateCount += processedStateCount;
  }
  return Number.isFinite(upperBound) ? upperBound : Number.NEGATIVE_INFINITY;
}

export function estimateMedleyCapacityContextBoundTeamSharedCoefficientUpperBoundForCombination(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
  slotBounds: MedleyContextBoundMcCormickSlotBounds[],
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  if (profiling) {
    profiling.capacityTeamSharedCoefficientUpperCallCount += 1;
    if (
      profiling.capacityTeamSharedCoefficientUpperStateCount
        >= MEDLEY_TEAM_SHARED_COEFFICIENT_GLOBAL_STATE_BUDGET
    ) {
      profiling.capacityTeamSharedCoefficientUpperAbortCount += 1;
      return null;
    }
  }

  const splitSlotPosition = slotBounds
    .map((bounds, slotPosition) => ({
      slotPosition,
      potential: (bounds.skillRateUpperBound - bounds.skillRateLowerBound) * bounds.powerUpperBound,
    }))
    .sort((left, right) => right.potential - left.potential)[0]?.slotPosition;
  if (splitSlotPosition === undefined) {
    return null;
  }

  const splitBounds = slotBounds[splitSlotPosition];
  if (splitBounds.skillRateUpperBound <= splitBounds.skillRateLowerBound) {
    return null;
  }

  const intervalWidth = (splitBounds.skillRateUpperBound - splitBounds.skillRateLowerBound)
    / MEDLEY_TEAM_SHARED_COEFFICIENT_INTERVAL_COUNT;
  let upperBound = Number.NEGATIVE_INFINITY;
  for (let intervalIndex = 0; intervalIndex < MEDLEY_TEAM_SHARED_COEFFICIENT_INTERVAL_COUNT; intervalIndex += 1) {
    const intervalLowerBound = intervalIndex === 0
      ? splitBounds.skillRateLowerBound
      : splitBounds.skillRateLowerBound + intervalWidth * intervalIndex;
    const intervalUpperBound = intervalIndex === MEDLEY_TEAM_SHARED_COEFFICIENT_INTERVAL_COUNT - 1
      ? splitBounds.skillRateUpperBound
      : splitBounds.skillRateLowerBound + intervalWidth * (intervalIndex + 1);
    let intervalUpper = Number.POSITIVE_INFINITY;
    for (let constraintMask = 0; constraintMask < (1 << remainingSlotIndices.length); constraintMask += 1) {
      const estimate = estimateMedleyCapacityContextBoundTeamSharedCoefficientUpperBoundForInterval(
        slots,
        remainingSlotIndices,
        cardsByCharacter,
        contextBoundUpperBySlot,
        slotBounds,
        splitSlotPosition,
        intervalLowerBound,
        intervalUpperBound,
        constraintMask,
        profiling,
      );
      if (estimate === null) {
        return null;
      }
      if (Number.isFinite(estimate)) {
        intervalUpper = Math.min(intervalUpper, estimate);
      }
    }
    if (Number.isFinite(intervalUpper)) {
      upperBound = Math.max(upperBound, intervalUpper);
    }
  }

  if (!Number.isFinite(upperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityTeamSharedCoefficientUpperCompletedCount += 1;
  }
  return upperBound;
}

export function estimateMedleyContextBoundSingleSlotScoreUpperBound(
  slot: MedleySlotSearch,
  contextBoundUpper: MedleyContextBoundUpperGroup,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  type SlotState = {
    power: number;
    averageRate: number;
    leaderRate: number;
  };
  const addState = (states: SlotState[], nextState: SlotState): void => {
    for (const state of states) {
      if (
        state.power >= nextState.power
        && state.averageRate >= nextState.averageRate
        && state.leaderRate >= nextState.leaderRate
      ) {
        return;
      }
    }
    for (let index = states.length - 1; index >= 0; index -= 1) {
      const state = states[index];
      if (
        nextState.power >= state.power
        && nextState.averageRate >= state.averageRate
        && nextState.leaderRate >= state.leaderRate
      ) {
        states.splice(index, 1);
      }
    }
    states.push(nextState);
  };

  const cardsByCharacter = new Map<number, SearchCard[]>();
  for (const card of slot.searchCards) {
    if (!contextBoundUpper.averageRateUpperByCardId.has(card.cardId)) {
      continue;
    }
    const cards = cardsByCharacter.get(card.characterId) ?? [];
    cards.push(card);
    cardsByCharacter.set(card.characterId, cards);
  }
  if (cardsByCharacter.size < MEDLEY_TEAM_SIZE) {
    return null;
  }

  let statesByCount: SlotState[][] = Array.from({ length: MEDLEY_TEAM_SIZE + 1 }, () => []);
  statesByCount[0].push({ power: 0, averageRate: 0, leaderRate: 0 });
  for (const cards of cardsByCharacter.values()) {
    const nextStatesByCount = statesByCount.map((states) => [...states]);
    for (let count = 0; count < MEDLEY_TEAM_SIZE; count += 1) {
      for (const state of statesByCount[count]) {
        for (const card of cards) {
          const averageRate = contextBoundUpper.averageRateUpperByCardId.get(card.cardId);
          const leaderRate = contextBoundUpper.leaderRateUpperByCardId.get(card.cardId);
          if (
            averageRate === undefined
            || leaderRate === undefined
            || !Number.isFinite(averageRate)
            || !Number.isFinite(leaderRate)
          ) {
            continue;
          }
          addState(nextStatesByCount[count + 1], {
            power: state.power + card.effectivePower,
            averageRate: state.averageRate + averageRate,
            leaderRate: Math.max(state.leaderRate, leaderRate),
          });
        }
      }
    }
    statesByCount = nextStatesByCount;
  }

  const finalStates = statesByCount[MEDLEY_TEAM_SIZE];
  if (profiling) {
    profiling.capacityTeamSharedCoefficientUpperStateCount += statesByCount.reduce(
      (sum, states) => sum + states.length,
      0,
    );
  }
  const upperBound = finalStates.reduce((best, state) => Math.max(
    best,
    Math.floor(state.power) * (slot.baseScoreRatePerPower + state.averageRate + state.leaderRate),
  ), Number.NEGATIVE_INFINITY);
  return Number.isFinite(upperBound) ? upperBound : null;
}

export function estimateMedleyCapacityContextBoundSingleSlotExactScoreUpperBoundForCombination(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  if (remainingSlotIndices.length !== MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityTeamSharedCoefficientUpperCallCount += 1;
  }

  let upperBound = Number.POSITIVE_INFINITY;
  for (let exactSlotPosition = 0; exactSlotPosition < remainingSlotIndices.length; exactSlotPosition += 1) {
    const exactSlotUpper = estimateMedleyContextBoundSingleSlotScoreUpperBound(
      slots[remainingSlotIndices[exactSlotPosition]],
      contextBoundUpperBySlot[exactSlotPosition],
      profiling,
    );
    if (exactSlotUpper === null || !Number.isFinite(exactSlotUpper)) {
      continue;
    }

    const pairSlotIndices = remainingSlotIndices.filter((_, slotPosition) => slotPosition !== exactSlotPosition);
    const pairContextBoundUpperBySlot = contextBoundUpperBySlot.filter((_, slotPosition) => slotPosition !== exactSlotPosition);
    const pairCardsByCharacter = buildMedleyCapacityCardsByCharacter(slots, pairSlotIndices, bannedCardIds);
    const pairSlotBounds = pairContextBoundUpperBySlot.map((contextBoundUpper, slotPosition) => (
      estimateMedleyContextBoundMcCormickSlotBounds(
        slots[pairSlotIndices[slotPosition]],
        contextBoundUpper,
      )
    ));
    if (!pairSlotBounds.every((bounds): bounds is MedleyContextBoundMcCormickSlotBounds => bounds !== null)) {
      continue;
    }

    let pairUpper = Number.POSITIVE_INFINITY;
    for (let constraintMask = 0; constraintMask < (1 << pairSlotIndices.length); constraintMask += 1) {
      const estimate = estimateMedleyCapacityContextBoundMcCormickScoreUpperBoundForCombination(
        slots,
        pairSlotIndices,
        pairCardsByCharacter,
        pairContextBoundUpperBySlot,
        pairSlotBounds,
        constraintMask,
      );
      if (estimate !== null && Number.isFinite(estimate)) {
        pairUpper = Math.min(pairUpper, estimate);
      }
    }
    if (Number.isFinite(pairUpper)) {
      upperBound = Math.min(upperBound, exactSlotUpper + pairUpper);
    }
  }

  if (!Number.isFinite(upperBound)) {
    if (profiling) {
      profiling.capacityTeamSharedCoefficientUpperAbortCount += 1;
    }
    return null;
  }
  if (profiling) {
    profiling.capacityTeamSharedCoefficientUpperCompletedCount += 1;
  }
  return upperBound;
}

export function buildMedleyContextBoundCardBoundPowerUpperBySlot(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
): MedleyCardBoundPowerUpperBySlot {
  return remainingSlotIndices.map((slotIndex, slotPosition) => {
    const slot = slots[slotIndex];
    const contextBoundUpper = contextBoundUpperBySlot[slotPosition];
    const bestPowerByCharacter = new Map<number, number>();
    for (const card of slot.searchCards) {
      if (!contextBoundUpper.averageRateUpperByCardId.has(card.cardId)) {
        continue;
      }
      bestPowerByCharacter.set(
        card.characterId,
        Math.max(bestPowerByCharacter.get(card.characterId) ?? Number.NEGATIVE_INFINITY, card.effectivePower),
      );
    }

    const sortedCharacterPowers = [...bestPowerByCharacter.entries()]
      .sort((left, right) => right[1] - left[1]);
    const powerUpperByCardId = new Map<number, number>();
    for (const card of slot.searchCards) {
      if (!contextBoundUpper.averageRateUpperByCardId.has(card.cardId)) {
        continue;
      }
      let otherPower = 0;
      let otherCharacterCount = 0;
      for (const [characterId, power] of sortedCharacterPowers) {
        if (characterId === card.characterId) {
          continue;
        }
        otherPower += power;
        otherCharacterCount += 1;
        if (otherCharacterCount === MEDLEY_TEAM_SIZE - 1) {
          break;
        }
      }
      if (otherCharacterCount === MEDLEY_TEAM_SIZE - 1) {
        powerUpperByCardId.set(card.cardId, card.effectivePower + otherPower);
      }
    }
    return powerUpperByCardId;
  });
}

export function estimateMedleyCapacityContextBoundCardBoundScoreUpperBoundForCombination(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  if (profiling) {
    profiling.capacityContextBoundCardBoundUpperCallCount += 1;
  }
  const slotCount = remainingSlotIndices.length;
  const maskCount = 1 << slotCount;
  const leaderMaskCount = 1 << slotCount;
  const targetLeaderMask = leaderMaskCount - 1;
  const transition = getMedleyCapacityTransition(slotCount);
  const cardBoundPowerUpperBySlot = buildMedleyContextBoundCardBoundPowerUpperBySlot(
    slots,
    remainingSlotIndices,
    contextBoundUpperBySlot,
  );
  const floorAwareCachesBySlot = remainingSlotIndices.map(() => (
    new Map<string, { averageScore: number; leaderScore: number }>()
  ));
  let states = new Float64Array(transition.stateCount * leaderMaskCount);
  states.fill(Number.NEGATIVE_INFINITY);
  states[0] = 0;

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptions = new Float64Array(maskCount * leaderMaskCount);
    characterOptions.fill(Number.NEGATIVE_INFINITY);
    characterOptions[0] = 0;

    for (const slotCards of cardsById.values()) {
      const nextCharacterOptions = characterOptions.slice();
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
          const currentValue = characterOptions[mask * leaderMaskCount + leaderMask];
          if (!Number.isFinite(currentValue)) {
            continue;
          }
          for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
            if ((mask & (1 << slotPosition)) !== 0) {
              continue;
            }
            const card = slotCards[slotPosition];
            if (!card) {
              continue;
            }
            const contextBoundUpper = contextBoundUpperBySlot[slotPosition];
            const averageRate = contextBoundUpper.averageRateUpperByCardId.get(card.cardId);
            if (averageRate === undefined || !Number.isFinite(averageRate)) {
              continue;
            }
            const cardBoundPowerUpper = cardBoundPowerUpperBySlot[slotPosition].get(card.cardId);
            if (cardBoundPowerUpper === undefined || !Number.isFinite(cardBoundPowerUpper)) {
              continue;
            }

            const nextMask = mask | (1 << slotPosition);
            const slot = slots[remainingSlotIndices[slotPosition]];
            const leaderRate = contextBoundUpper.leaderRateUpperByCardId.get(card.cardId);
            const skillScoreUpper = estimateMedleyContextBoundSkillScoreUpper(
              slot,
              card,
              cardBoundPowerUpper,
              averageRate,
              leaderRate !== undefined && Number.isFinite(leaderRate) ? leaderRate : 0,
              floorAwareCachesBySlot[slotPosition],
            );
            const baseContribution = card.effectivePower * slot.baseScoreRatePerPower;
            const averageContribution = baseContribution + skillScoreUpper.averageScore;
            const nextIndex = nextMask * leaderMaskCount + leaderMask;
            nextCharacterOptions[nextIndex] = Math.max(
              nextCharacterOptions[nextIndex],
              currentValue + averageContribution,
            );

            const leaderBit = 1 << slotPosition;
            if ((leaderMask & leaderBit) === 0) {
              if (leaderRate === undefined || !Number.isFinite(leaderRate)) {
                continue;
              }
              const nextLeaderMask = leaderMask | leaderBit;
              const leaderIndex = nextMask * leaderMaskCount + nextLeaderMask;
              nextCharacterOptions[leaderIndex] = Math.max(
                nextCharacterOptions[leaderIndex],
                currentValue + baseContribution + skillScoreUpper.leaderTotalScore,
              );
            }
          }
        }
      }
      characterOptions = nextCharacterOptions;
    }

    const nextStates = states.slice();
    for (let stateIndex = 0; stateIndex < transition.stateCount; stateIndex += 1) {
      for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
        const currentValue = states[stateIndex * leaderMaskCount + leaderMask];
        if (!Number.isFinite(currentValue)) {
          continue;
        }
        for (let characterMask = 1; characterMask < maskCount; characterMask += 1) {
          const nextStateIndex = transition.nextIndexByMask[stateIndex * maskCount + characterMask];
          if (nextStateIndex < 0) {
            continue;
          }
          for (let characterLeaderMask = 0; characterLeaderMask < leaderMaskCount; characterLeaderMask += 1) {
            if (
              (characterLeaderMask & ~characterMask) !== 0
              || (leaderMask & characterLeaderMask) !== 0
            ) {
              continue;
            }
            const characterValue = characterOptions[characterMask * leaderMaskCount + characterLeaderMask];
            if (!Number.isFinite(characterValue)) {
              continue;
            }
            const nextLeaderMask = leaderMask | characterLeaderMask;
            const nextIndex = nextStateIndex * leaderMaskCount + nextLeaderMask;
            nextStates[nextIndex] = Math.max(nextStates[nextIndex], currentValue + characterValue);
          }
        }
      }
    }
    states = nextStates;
  }

  const upperBound = states[transition.targetIndex * leaderMaskCount + targetLeaderMask];
  if (!Number.isFinite(upperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextBoundCardBoundUpperCompletedCount += 1;
  }
  return upperBound;
}

export function addMedleyCapacityPowerSplitState(
  states: Map<number, number>,
  splitPower: number,
  score: number,
): void {
  const currentScore = states.get(splitPower);
  if (currentScore === undefined || score > currentScore) {
    states.set(splitPower, score);
  }
}

export function estimateMedleyCapacityContextBoundPowerSplitMcCormickScoreUpperBoundForInterval(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
  slotBounds: MedleyContextBoundMcCormickSlotBounds[],
  splitSlotPosition: number,
  splitPowerLowerBound: number,
  splitPowerUpperBound: number,
  constraintMask: number,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  const slotCount = remainingSlotIndices.length;
  const maskCount = 1 << slotCount;
  const leaderMaskCount = 1 << slotCount;
  const targetLeaderMask = leaderMaskCount - 1;
  const transition = getMedleyCapacityTransition(slotCount);
  const powerCoefficientBySlot: number[] = [];
  const skillMultiplierBySlot: number[] = [];
  let constantTerm = 0;
  let processedStateCount = 0;

  const abort = (): null => {
    if (profiling) {
      profiling.capacityContextBoundPowerSplitMcCormickUpperAbortCount += 1;
      profiling.capacityContextBoundPowerSplitMcCormickUpperStateCount += processedStateCount;
      profiling.capacityContextBoundPowerSplitMcCormickUpperMaxProcessedStateCount = Math.max(
        profiling.capacityContextBoundPowerSplitMcCormickUpperMaxProcessedStateCount,
        processedStateCount,
      );
    }
    return null;
  };
  const accountState = (): boolean => {
    processedStateCount += 1;
    const totalStateCount = processedStateCount
      + (profiling?.capacityContextBoundPowerSplitMcCormickUpperStateCount ?? 0);
    return (
      processedStateCount <= MEDLEY_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_STATE_BUDGET
      && totalStateCount <= MEDLEY_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_GLOBAL_STATE_BUDGET
    );
  };

  for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
    const slot = slots[remainingSlotIndices[slotPosition]];
    const bounds = slotBounds[slotPosition];
    const powerLowerBound = slotPosition === splitSlotPosition ? splitPowerLowerBound : bounds.powerLowerBound;
    const powerUpperBound = slotPosition === splitSlotPosition ? splitPowerUpperBound : bounds.powerUpperBound;
    if ((constraintMask & (1 << slotPosition)) !== 0) {
      powerCoefficientBySlot.push(slot.baseScoreRatePerPower + bounds.skillRateUpperBound);
      skillMultiplierBySlot.push(powerLowerBound);
      constantTerm -= powerLowerBound * bounds.skillRateUpperBound;
    } else {
      powerCoefficientBySlot.push(slot.baseScoreRatePerPower + bounds.skillRateLowerBound);
      skillMultiplierBySlot.push(powerUpperBound);
      constantTerm -= powerUpperBound * bounds.skillRateLowerBound;
    }
  }

  let statesByIndexAndLeaderMask: Array<Map<number, number>> = Array.from(
    { length: transition.stateCount * leaderMaskCount },
    () => new Map<number, number>(),
  );
  statesByIndexAndLeaderMask[0].set(0, 0);

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptions: Array<Map<number, number>> = Array.from(
      { length: maskCount * leaderMaskCount },
      () => new Map<number, number>(),
    );
    characterOptions[0].set(0, 0);

    for (const slotCards of cardsById.values()) {
      const nextCharacterOptions = characterOptions.map(cloneMedleyCapacityBucketedJointStateMap);
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
          const states = characterOptions[mask * leaderMaskCount + leaderMask];
          if (states.size === 0) {
            continue;
          }
          for (const [splitPower, currentValue] of states.entries()) {
            for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
              if ((mask & (1 << slotPosition)) !== 0) {
                continue;
              }
              const card = slotCards[slotPosition];
              if (!card) {
                continue;
              }
              const contextBoundUpper = contextBoundUpperBySlot[slotPosition];
              const averageRate = contextBoundUpper.averageRateUpperByCardId.get(card.cardId);
              if (averageRate === undefined || !Number.isFinite(averageRate)) {
                continue;
              }

              const nextMask = mask | (1 << slotPosition);
              const nextSplitPower = slotPosition === splitSlotPosition
                ? splitPower + card.effectivePower
                : splitPower;
              const baseContribution = card.effectivePower * powerCoefficientBySlot[slotPosition]
                + skillMultiplierBySlot[slotPosition] * averageRate;
              if (!accountState()) {
                return abort();
              }
              addMedleyCapacityPowerSplitState(
                nextCharacterOptions[nextMask * leaderMaskCount + leaderMask],
                nextSplitPower,
                currentValue + baseContribution,
              );

              const leaderBit = 1 << slotPosition;
              if ((leaderMask & leaderBit) === 0) {
                const leaderRate = contextBoundUpper.leaderRateUpperByCardId.get(card.cardId);
                if (leaderRate === undefined || !Number.isFinite(leaderRate)) {
                  continue;
                }
                const nextLeaderMask = leaderMask | leaderBit;
                if (!accountState()) {
                  return abort();
                }
                addMedleyCapacityPowerSplitState(
                  nextCharacterOptions[nextMask * leaderMaskCount + nextLeaderMask],
                  nextSplitPower,
                  currentValue + baseContribution + skillMultiplierBySlot[slotPosition] * leaderRate,
                );
              }
            }
          }
        }
      }
      characterOptions = nextCharacterOptions;
    }

    const nextStatesByIndexAndLeaderMask = statesByIndexAndLeaderMask
      .map(cloneMedleyCapacityBucketedJointStateMap);
    for (let stateIndex = 0; stateIndex < transition.stateCount; stateIndex += 1) {
      for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
        const states = statesByIndexAndLeaderMask[stateIndex * leaderMaskCount + leaderMask];
        if (states.size === 0) {
          continue;
        }
        for (let characterMask = 1; characterMask < maskCount; characterMask += 1) {
          const nextStateIndex = transition.nextIndexByMask[stateIndex * maskCount + characterMask];
          if (nextStateIndex < 0) {
            continue;
          }
          for (let characterLeaderMask = 0; characterLeaderMask < leaderMaskCount; characterLeaderMask += 1) {
            if (
              (characterLeaderMask & ~characterMask) !== 0
              || (leaderMask & characterLeaderMask) !== 0
            ) {
              continue;
            }
            const options = characterOptions[characterMask * leaderMaskCount + characterLeaderMask];
            if (options.size === 0) {
              continue;
            }
            const nextLeaderMask = leaderMask | characterLeaderMask;
            const nextStates = nextStatesByIndexAndLeaderMask[
              nextStateIndex * leaderMaskCount + nextLeaderMask
            ];
            for (const [splitPower, currentValue] of states.entries()) {
              for (const [optionSplitPower, optionValue] of options.entries()) {
                if (!accountState()) {
                  return abort();
                }
                addMedleyCapacityPowerSplitState(
                  nextStates,
                  splitPower + optionSplitPower,
                  currentValue + optionValue,
                );
              }
            }
          }
        }
      }
    }
    statesByIndexAndLeaderMask = nextStatesByIndexAndLeaderMask;
  }

  const targetStates = statesByIndexAndLeaderMask[transition.targetIndex * leaderMaskCount + targetLeaderMask];
  let upperBound = Number.NEGATIVE_INFINITY;
  const epsilon = 1e-6;
  for (const [splitPower, score] of targetStates.entries()) {
    if (splitPower + epsilon < splitPowerLowerBound || splitPower - epsilon > splitPowerUpperBound) {
      continue;
    }
    upperBound = Math.max(upperBound, score + constantTerm);
  }
  if (!Number.isFinite(upperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextBoundPowerSplitMcCormickUpperCompletedCount += 1;
    profiling.capacityContextBoundPowerSplitMcCormickUpperStateCount += processedStateCount;
    profiling.capacityContextBoundPowerSplitMcCormickUpperMaxProcessedStateCount = Math.max(
      profiling.capacityContextBoundPowerSplitMcCormickUpperMaxProcessedStateCount,
      processedStateCount,
    );
  }
  return upperBound;
}

export function estimateMedleyCapacityContextBoundPowerSplitMcCormickScoreUpperBoundForCombination(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
  slotBounds: MedleyContextBoundMcCormickSlotBounds[],
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  if (profiling) {
    profiling.capacityContextBoundPowerSplitMcCormickUpperCallCount += 1;
    if (
      profiling.capacityContextBoundPowerSplitMcCormickUpperStateCount
        >= MEDLEY_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_GLOBAL_STATE_BUDGET
    ) {
      profiling.capacityContextBoundPowerSplitMcCormickUpperAbortCount += 1;
      return null;
    }
  }

  const splitSlotPosition = slotBounds
    .map((bounds, slotPosition) => ({
      slotPosition,
      potential: (bounds.powerUpperBound - bounds.powerLowerBound) * bounds.skillRateUpperBound,
    }))
    .sort((left, right) => right.potential - left.potential)[0]?.slotPosition;
  if (splitSlotPosition === undefined) {
    return null;
  }

  const splitBounds = slotBounds[splitSlotPosition];
  if (splitBounds.powerUpperBound <= splitBounds.powerLowerBound) {
    return null;
  }

  const intervalWidth = (splitBounds.powerUpperBound - splitBounds.powerLowerBound)
    / MEDLEY_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_BUCKET_COUNT;
  let upperBound = Number.NEGATIVE_INFINITY;
  for (
    let intervalIndex = 0;
    intervalIndex < MEDLEY_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_BUCKET_COUNT;
    intervalIndex += 1
  ) {
    const intervalLowerBound = intervalIndex === 0
      ? splitBounds.powerLowerBound
      : splitBounds.powerLowerBound + intervalWidth * intervalIndex;
    const intervalUpperBound = intervalIndex === MEDLEY_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_BUCKET_COUNT - 1
      ? splitBounds.powerUpperBound
      : splitBounds.powerLowerBound + intervalWidth * (intervalIndex + 1);
    let intervalUpper = Number.POSITIVE_INFINITY;
    for (let constraintMask = 0; constraintMask < (1 << remainingSlotIndices.length); constraintMask += 1) {
      const estimate = estimateMedleyCapacityContextBoundPowerSplitMcCormickScoreUpperBoundForInterval(
        slots,
        remainingSlotIndices,
        cardsByCharacter,
        contextBoundUpperBySlot,
        slotBounds,
        splitSlotPosition,
        intervalLowerBound,
        intervalUpperBound,
        constraintMask,
        profiling,
      );
      if (estimate === null) {
        return null;
      }
      intervalUpper = Math.min(intervalUpper, estimate);
    }
    if (Number.isFinite(intervalUpper)) {
      upperBound = Math.max(upperBound, intervalUpper);
    }
  }

  return Number.isFinite(upperBound) ? upperBound : null;
}

export function estimateMedleyCapacityContextBoundMcCormickScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
  enableTeamSharedCoefficientUpper = false,
): number | null {
  if (remainingSlotIndices.length !== MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextBoundMcCormickUpperCallCount += 1;
  }

  const groupsBySlot = remainingSlotIndices.map((slotIndex) => (
    buildMedleyContextBoundUpperGroups(slots[slotIndex], bannedCardIds)
  ));
  if (groupsBySlot.some((groups) => groups.length === 0)) {
    return null;
  }

  let combinationCount = 1;
  for (const groups of groupsBySlot) {
    combinationCount *= groups.length;
  }
  if (profiling) {
    profiling.capacityContextBoundMcCormickUpperCombinationCount = combinationCount;
  }

  const combinations: Array<{
    coefficientUpperBound: number;
    contextBoundUpperBySlot: MedleyContextBoundUpperGroup[];
  }> = [];
  for (const firstSlotUpper of groupsBySlot[0]) {
    for (const secondSlotUpper of groupsBySlot[1]) {
      for (const thirdSlotUpper of groupsBySlot[2]) {
        const contextBoundUpperBySlot = [firstSlotUpper, secondSlotUpper, thirdSlotUpper];
        const coefficientUpperBound = estimateMedleyCapacityCardSpecificCoefficientScoreUpperBound(
          remainingSlotIndices,
          cardsByCharacter,
          contextBoundUpperBySlot.map((group) => group.coefficientUpperByCardId),
        );
        if (coefficientUpperBound !== null && Number.isFinite(coefficientUpperBound)) {
          combinations.push({ coefficientUpperBound, contextBoundUpperBySlot });
        }
      }
    }
  }
  if (combinations.length === 0) {
    return null;
  }

  combinations.sort((left, right) => right.coefficientUpperBound - left.coefficientUpperBound);
  const baselineUpperBound = combinations[0].coefficientUpperBound;
  let processedUpperBound = Number.NEGATIVE_INFINITY;
  let processedCombinationCount = 0;
  const maxProcessedCombinationCount = Math.min(
    MEDLEY_CONTEXT_BOUND_MCCORMICK_MAX_PROCESSED_COMBINATIONS,
    combinations.length,
  );

  while (processedCombinationCount < maxProcessedCombinationCount) {
    const combination = combinations[processedCombinationCount];
    if (
      processedCombinationCount > 0
      && combination.coefficientUpperBound < baselineUpperBound - MEDLEY_CONTEXT_BOUND_MCCORMICK_SCORE_WINDOW
    ) {
      break;
    }

    const slotBounds = combination.contextBoundUpperBySlot.map((contextBoundUpper, slotPosition) => (
      estimateMedleyContextBoundMcCormickSlotBounds(
        slots[remainingSlotIndices[slotPosition]],
        contextBoundUpper,
      )
    ));
    let combinationUpperBound = combination.coefficientUpperBound;
    if (slotBounds.every((bounds): bounds is MedleyContextBoundMcCormickSlotBounds => bounds !== null)) {
      for (let constraintMask = 0; constraintMask < (1 << remainingSlotIndices.length); constraintMask += 1) {
        const estimate = estimateMedleyCapacityContextBoundMcCormickScoreUpperBoundForCombination(
          slots,
          remainingSlotIndices,
          cardsByCharacter,
          combination.contextBoundUpperBySlot,
          slotBounds,
          constraintMask,
        );
        if (estimate !== null && Number.isFinite(estimate)) {
          combinationUpperBound = Math.min(combinationUpperBound, estimate);
        }
      }
      if (
        MEDLEY_ENABLE_CONTEXT_BOUND_SPLIT_SKILL_MCCORMICK_UPPER
        && processedCombinationCount < MEDLEY_CONTEXT_BOUND_SPLIT_SKILL_MCCORMICK_MAX_PROCESSED_COMBINATIONS
      ) {
        const splitSkillEstimate = estimateMedleyCapacityContextBoundSplitSkillMcCormickScoreUpperBoundForCombination(
          slots,
          remainingSlotIndices,
          cardsByCharacter,
          combination.contextBoundUpperBySlot,
          slotBounds,
          profiling,
        );
        if (splitSkillEstimate !== null && Number.isFinite(splitSkillEstimate)) {
          if (profiling) {
            profiling.capacityContextBoundSplitSkillMcCormickUpperProcessedCombinationCount += 1;
          }
          if (profiling && splitSkillEstimate < combinationUpperBound) {
            profiling.bestCapacityContextBoundSplitSkillMcCormickUpperCombinationImprovement = Math.max(
              profiling.bestCapacityContextBoundSplitSkillMcCormickUpperCombinationImprovement,
              combinationUpperBound - splitSkillEstimate,
            );
          }
          combinationUpperBound = Math.min(combinationUpperBound, splitSkillEstimate);
        }
      }
      if (
        MEDLEY_ENABLE_TEAM_SHARED_COEFFICIENT_UPPER
        && enableTeamSharedCoefficientUpper
        && processedCombinationCount < MEDLEY_TEAM_SHARED_COEFFICIENT_MAX_PROCESSED_COMBINATIONS
      ) {
        const teamSharedEstimate = estimateMedleyCapacityContextBoundSingleSlotExactScoreUpperBoundForCombination(
          slots,
          remainingSlotIndices,
          bannedCardIds,
          combination.contextBoundUpperBySlot,
          profiling,
        );
        if (teamSharedEstimate !== null && Number.isFinite(teamSharedEstimate)) {
          if (profiling && teamSharedEstimate < combinationUpperBound) {
            profiling.bestCapacityTeamSharedCoefficientUpperImprovement = Math.max(
              profiling.bestCapacityTeamSharedCoefficientUpperImprovement,
              combinationUpperBound - teamSharedEstimate,
            );
          }
          combinationUpperBound = Math.min(combinationUpperBound, teamSharedEstimate);
        }
      }
      if (
        MEDLEY_ENABLE_CONTEXT_BOUND_CARD_BOUND_UPPER
        && processedCombinationCount < MEDLEY_CONTEXT_BOUND_CARD_BOUND_MAX_PROCESSED_COMBINATIONS
      ) {
        const contextCardBoundEstimate = estimateMedleyCapacityContextBoundCardBoundScoreUpperBoundForCombination(
          slots,
          remainingSlotIndices,
          cardsByCharacter,
          combination.contextBoundUpperBySlot,
          profiling,
        );
        if (contextCardBoundEstimate !== null && Number.isFinite(contextCardBoundEstimate)) {
          if (profiling) {
            profiling.capacityContextBoundCardBoundUpperProcessedCombinationCount += 1;
          }
          if (profiling && contextCardBoundEstimate < combinationUpperBound) {
            profiling.bestCapacityContextBoundCardBoundUpperCombinationImprovement = Math.max(
              profiling.bestCapacityContextBoundCardBoundUpperCombinationImprovement,
              combinationUpperBound - contextCardBoundEstimate,
            );
          }
          combinationUpperBound = Math.min(combinationUpperBound, contextCardBoundEstimate);
        }
      }
      if (
        MEDLEY_ENABLE_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_UPPER
        && processedCombinationCount < MEDLEY_CONTEXT_BOUND_POWER_SPLIT_MCCORMICK_MAX_PROCESSED_COMBINATIONS
      ) {
        const powerSplitEstimate = estimateMedleyCapacityContextBoundPowerSplitMcCormickScoreUpperBoundForCombination(
          slots,
          remainingSlotIndices,
          cardsByCharacter,
          combination.contextBoundUpperBySlot,
          slotBounds,
          profiling,
        );
        if (powerSplitEstimate !== null && Number.isFinite(powerSplitEstimate)) {
          if (profiling) {
            profiling.capacityContextBoundPowerSplitMcCormickUpperProcessedCombinationCount += 1;
          }
          if (profiling && powerSplitEstimate < combinationUpperBound) {
            profiling.bestCapacityContextBoundPowerSplitMcCormickUpperCombinationImprovement = Math.max(
              profiling.bestCapacityContextBoundPowerSplitMcCormickUpperCombinationImprovement,
              combinationUpperBound - powerSplitEstimate,
            );
          }
          combinationUpperBound = Math.min(combinationUpperBound, powerSplitEstimate);
        }
      }
    }

    if (profiling && combinationUpperBound < combination.coefficientUpperBound) {
      profiling.bestCapacityContextBoundMcCormickUpperCombinationImprovement = Math.max(
        profiling.bestCapacityContextBoundMcCormickUpperCombinationImprovement,
        combination.coefficientUpperBound - combinationUpperBound,
      );
    }
    processedUpperBound = Math.max(processedUpperBound, combinationUpperBound);
    processedCombinationCount += 1;
  }

  const unprocessedUpperBound = combinations[processedCombinationCount]?.coefficientUpperBound
    ?? Number.NEGATIVE_INFINITY;
  const upperBound = Math.max(processedUpperBound, unprocessedUpperBound);
  if (!Number.isFinite(upperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextBoundMcCormickUpperCompletedCount += 1;
    profiling.capacityContextBoundMcCormickUpperProcessedCombinationCount += processedCombinationCount;
    profiling.capacityContextBoundMcCormickUpperProcessedMaxCoefficientUpper = Math.max(
      profiling.capacityContextBoundMcCormickUpperProcessedMaxCoefficientUpper ?? Number.NEGATIVE_INFINITY,
      combinations[0].coefficientUpperBound,
    );
    profiling.capacityContextBoundMcCormickUpperUnprocessedMaxCoefficientUpper = Math.max(
      profiling.capacityContextBoundMcCormickUpperUnprocessedMaxCoefficientUpper ?? Number.NEGATIVE_INFINITY,
      Number.isFinite(unprocessedUpperBound) ? unprocessedUpperBound : Number.NEGATIVE_INFINITY,
    );
  }
  return upperBound;
}

export function getMedleyCapacityContextBoundBucketedJointStateBudget(targetBucketCount: number): number {
  if (targetBucketCount >= 64) {
    return 350_000;
  }
  if (targetBucketCount >= 32) {
    return 850_000;
  }
  return MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_STATE_BUDGET;
}

export function estimateMedleyCapacityContextBoundBucketedJointScoreUpperBoundForBucket(
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
  bucketSize: number,
  targetBucketCount: number,
  stateBudget: number,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): MedleyCapacityBucketedJointUpperEstimate | null {
  const slotCount = remainingSlotIndices.length;
  const maskCount = 1 << slotCount;
  const leaderMaskCount = 1 << slotCount;
  const targetLeaderMask = leaderMaskCount - 1;
  const transition = getMedleyCapacityTransition(slotCount);
  let processedStateCount = 0;

  const abort = (): null => {
    if (profiling) {
      profiling.capacityContextBoundBucketedJointUpperAbortCount += 1;
      profiling.capacityContextBoundBucketedJointUpperStateCount += processedStateCount;
      profiling.capacityContextBoundBucketedJointUpperMaxProcessedStateCount = Math.max(
        profiling.capacityContextBoundBucketedJointUpperMaxProcessedStateCount,
        processedStateCount,
      );
      profiling.capacityContextBoundBucketedJointUpperBucketSize = bucketSize;
      profiling.capacityContextBoundBucketedJointUpperTargetBucketCount = targetBucketCount;
    }
    return null;
  };
  const accountState = (): boolean => {
    processedStateCount += 1;
    const totalStateCount = processedStateCount
      + (profiling?.capacityContextBoundBucketedJointUpperStateCount ?? 0);
    return (
      processedStateCount <= stateBudget
      && totalStateCount <= MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_GLOBAL_STATE_BUDGET
    );
  };

  let statesByIndexAndLeaderMask: Array<Map<number, number>> = Array.from(
    { length: transition.stateCount * leaderMaskCount },
    () => new Map<number, number>(),
  );
  statesByIndexAndLeaderMask[0].set(0, 0);

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptions: Array<Map<number, number>> = Array.from(
      { length: maskCount * leaderMaskCount },
      () => new Map<number, number>(),
    );
    characterOptions[0].set(0, 0);

    for (const slotCards of cardsById.values()) {
      const nextCharacterOptions = characterOptions.map(cloneMedleyCapacityBucketedJointStateMap);
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
          const states = characterOptions[mask * leaderMaskCount + leaderMask];
          if (states.size === 0) {
            continue;
          }
          for (const [coefficientBucket, contextBoundScore] of states.entries()) {
            for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
              if ((mask & (1 << slotPosition)) !== 0) {
                continue;
              }
              const card = slotCards[slotPosition];
              if (!card) {
                continue;
              }
              const contextBoundUpper = contextBoundUpperBySlot[slotPosition];
              const coefficient = contextBoundUpper.coefficientUpperByCardId.get(card.cardId);
              const averageScore = contextBoundUpper.averageScoreUpperByCardId.get(card.cardId);
              if (
                coefficient === undefined
                || averageScore === undefined
                || !Number.isFinite(coefficient)
                || !Number.isFinite(averageScore)
              ) {
                continue;
              }

              const nextMask = mask | (1 << slotPosition);
              const coefficientContribution = card.effectivePower * coefficient;
              const nextCoefficientBucket = getMedleyCapacityBucketedJointBucket(
                coefficientBucket * bucketSize + coefficientContribution,
                bucketSize,
              );
              if (!accountState()) {
                return abort();
              }
              addMedleyCapacityBucketedJointState(
                nextCharacterOptions[nextMask * leaderMaskCount + leaderMask],
                nextCoefficientBucket,
                contextBoundScore + averageScore,
              );

              const leaderBit = 1 << slotPosition;
              if ((leaderMask & leaderBit) === 0) {
                const leaderScore = contextBoundUpper.leaderScoreUpperByCardId.get(card.cardId);
                if (leaderScore === undefined || !Number.isFinite(leaderScore)) {
                  continue;
                }
                const nextLeaderMask = leaderMask | leaderBit;
                if (!accountState()) {
                  return abort();
                }
                addMedleyCapacityBucketedJointState(
                  nextCharacterOptions[nextMask * leaderMaskCount + nextLeaderMask],
                  nextCoefficientBucket,
                  contextBoundScore + averageScore + leaderScore,
                );
              }
            }
          }
        }
      }
      pruneMedleyCapacityBucketedJointStateMaps(nextCharacterOptions);
      characterOptions = nextCharacterOptions;
    }

    const nextStatesByIndexAndLeaderMask = statesByIndexAndLeaderMask
      .map(cloneMedleyCapacityBucketedJointStateMap);
    for (let stateIndex = 0; stateIndex < transition.stateCount; stateIndex += 1) {
      for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
        const states = statesByIndexAndLeaderMask[stateIndex * leaderMaskCount + leaderMask];
        if (states.size === 0) {
          continue;
        }
        for (let characterMask = 1; characterMask < maskCount; characterMask += 1) {
          const nextStateIndex = transition.nextIndexByMask[stateIndex * maskCount + characterMask];
          if (nextStateIndex < 0) {
            continue;
          }
          for (let characterLeaderMask = 0; characterLeaderMask < leaderMaskCount; characterLeaderMask += 1) {
            if (
              (characterLeaderMask & ~characterMask) !== 0
              || (leaderMask & characterLeaderMask) !== 0
            ) {
              continue;
            }
            const options = characterOptions[characterMask * leaderMaskCount + characterLeaderMask];
            if (options.size === 0) {
              continue;
            }
            const nextLeaderMask = leaderMask | characterLeaderMask;
            const nextStates = nextStatesByIndexAndLeaderMask[
              nextStateIndex * leaderMaskCount + nextLeaderMask
            ];
            for (const [coefficientBucket, contextBoundScore] of states.entries()) {
              for (const [optionCoefficientBucket, optionContextBoundScore] of options.entries()) {
                if (!accountState()) {
                  return abort();
                }
                addMedleyCapacityBucketedJointState(
                  nextStates,
                  coefficientBucket + optionCoefficientBucket,
                  contextBoundScore + optionContextBoundScore,
                );
              }
            }
          }
        }
      }
    }
    pruneMedleyCapacityBucketedJointStateMaps(nextStatesByIndexAndLeaderMask);
    statesByIndexAndLeaderMask = nextStatesByIndexAndLeaderMask;
  }

  const targetStates = statesByIndexAndLeaderMask[transition.targetIndex * leaderMaskCount + targetLeaderMask];
  let upperBound = Number.NEGATIVE_INFINITY;
  for (const [coefficientBucket, contextBoundScore] of targetStates.entries()) {
    upperBound = Math.max(upperBound, Math.min(coefficientBucket * bucketSize, contextBoundScore));
  }
  if (!Number.isFinite(upperBound)) {
    return null;
  }

  if (profiling) {
    profiling.capacityContextBoundBucketedJointUpperCompletedCount += 1;
    profiling.capacityContextBoundBucketedJointUpperStateCount += processedStateCount;
    profiling.capacityContextBoundBucketedJointUpperMaxProcessedStateCount = Math.max(
      profiling.capacityContextBoundBucketedJointUpperMaxProcessedStateCount,
      processedStateCount,
    );
    profiling.capacityContextBoundBucketedJointUpperBucketSize = bucketSize;
    profiling.capacityContextBoundBucketedJointUpperTargetBucketCount = targetBucketCount;
  }
  return {
    upperBound,
    bucketSize,
    targetBucketCount,
  };
}

export function estimateMedleyCapacityContextBoundBucketedJointScoreUpperBoundForCombination(
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
  coefficientUpperBound: number,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): MedleyCapacityBucketedJointUpperEstimate | null {
  if (!Number.isFinite(coefficientUpperBound)) {
    return null;
  }

  for (const targetBucketCount of MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_TARGET_BUCKET_COUNTS) {
    const bucketSize = Math.max(
      MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_MIN_BUCKET_SIZE,
      Math.ceil(coefficientUpperBound / targetBucketCount),
    );
    const stateBudget = getMedleyCapacityContextBoundBucketedJointStateBudget(targetBucketCount);
    const estimate = estimateMedleyCapacityContextBoundBucketedJointScoreUpperBoundForBucket(
      remainingSlotIndices,
      cardsByCharacter,
      contextBoundUpperBySlot,
      bucketSize,
      targetBucketCount,
      stateBudget,
      profiling,
    );
    if (estimate !== null) {
      return estimate;
    }
  }

  return null;
}

export function estimateMedleyCapacityContextBoundBucketedJointScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): MedleyCapacityBucketedJointUpperEstimate | null {
  if (remainingSlotIndices.length !== MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextBoundBucketedJointUpperCallCount += 1;
    if (
      profiling.capacityContextBoundBucketedJointUpperStateCount
        >= MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_GLOBAL_STATE_BUDGET
    ) {
      profiling.capacityContextBoundBucketedJointUpperAbortCount += 1;
      return null;
    }
  }

  const groupsBySlot = remainingSlotIndices.map((slotIndex) => (
    buildMedleyContextBoundUpperGroups(slots[slotIndex], bannedCardIds)
  ));
  if (groupsBySlot.some((groups) => groups.length === 0)) {
    return null;
  }

  let combinationCount = 1;
  for (const groups of groupsBySlot) {
    combinationCount *= groups.length;
  }
  if (profiling) {
    profiling.capacityContextBoundBucketedJointUpperCombinationCount = combinationCount;
  }

  const combinations: Array<{
    coefficientUpperBound: number;
    contextBoundUpperBySlot: MedleyContextBoundUpperGroup[];
  }> = [];
  for (const firstSlotUpper of groupsBySlot[0]) {
    for (const secondSlotUpper of groupsBySlot[1]) {
      for (const thirdSlotUpper of groupsBySlot[2]) {
        const contextBoundUpperBySlot = [firstSlotUpper, secondSlotUpper, thirdSlotUpper];
        const coefficientUpperBound = estimateMedleyCapacityCardSpecificCoefficientScoreUpperBound(
          remainingSlotIndices,
          cardsByCharacter,
          contextBoundUpperBySlot.map((group) => group.coefficientUpperByCardId),
        );
        if (coefficientUpperBound !== null && Number.isFinite(coefficientUpperBound)) {
          combinations.push({ coefficientUpperBound, contextBoundUpperBySlot });
        }
      }
    }
  }
  if (combinations.length === 0) {
    return null;
  }

  combinations.sort((left, right) => right.coefficientUpperBound - left.coefficientUpperBound);
  const baselineUpperBound = combinations[0].coefficientUpperBound;
  let processedUpperBound = Number.NEGATIVE_INFINITY;
  let processedCombinationCount = 0;
  let bestEstimate: MedleyCapacityBucketedJointUpperEstimate | null = null;
  const maxProcessedCombinationCount = Math.min(
    MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_MAX_PROCESSED_COMBINATIONS,
    combinations.length,
  );

  while (processedCombinationCount < maxProcessedCombinationCount) {
    const combination = combinations[processedCombinationCount];
    if (
      processedCombinationCount > 0
      && combination.coefficientUpperBound
        < baselineUpperBound - MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_SCORE_WINDOW
    ) {
      break;
    }

    const estimate = estimateMedleyCapacityContextBoundBucketedJointScoreUpperBoundForCombination(
      remainingSlotIndices,
      cardsByCharacter,
      combination.contextBoundUpperBySlot,
      combination.coefficientUpperBound,
      profiling,
    );
    const combinationUpperBound = estimate === null
      ? combination.coefficientUpperBound
      : Math.min(combination.coefficientUpperBound, estimate.upperBound);
    if (profiling && estimate !== null && combinationUpperBound < combination.coefficientUpperBound) {
      profiling.bestCapacityContextBoundBucketedJointUpperCombinationImprovement = Math.max(
        profiling.bestCapacityContextBoundBucketedJointUpperCombinationImprovement,
        combination.coefficientUpperBound - combinationUpperBound,
      );
    }
    processedUpperBound = Math.max(processedUpperBound, combinationUpperBound);
    if (estimate !== null && (bestEstimate === null || estimate.upperBound < bestEstimate.upperBound)) {
      bestEstimate = estimate;
    }
    processedCombinationCount += 1;
  }

  const unprocessedUpperBound = combinations[processedCombinationCount]?.coefficientUpperBound
    ?? Number.NEGATIVE_INFINITY;
  const upperBound = Math.max(processedUpperBound, unprocessedUpperBound);
  if (!Number.isFinite(upperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityContextBoundBucketedJointUpperProcessedCombinationCount += processedCombinationCount;
    profiling.capacityContextBoundBucketedJointUpperProcessedMaxCoefficientUpper = Math.max(
      profiling.capacityContextBoundBucketedJointUpperProcessedMaxCoefficientUpper ?? Number.NEGATIVE_INFINITY,
      combinations[0].coefficientUpperBound,
    );
    profiling.capacityContextBoundBucketedJointUpperUnprocessedMaxCoefficientUpper = Math.max(
      profiling.capacityContextBoundBucketedJointUpperUnprocessedMaxCoefficientUpper ?? Number.NEGATIVE_INFINITY,
      Number.isFinite(unprocessedUpperBound) ? unprocessedUpperBound : Number.NEGATIVE_INFINITY,
    );
  }
  return {
    upperBound,
    bucketSize: bestEstimate?.bucketSize ?? MEDLEY_CONTEXT_BOUND_BUCKETED_JOINT_MIN_BUCKET_SIZE,
    targetBucketCount: bestEstimate?.targetBucketCount ?? 0,
  };
}
