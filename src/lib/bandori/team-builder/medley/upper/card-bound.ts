/*
 * Card-bound and card-specific capacity upper models.
 *
 * These bounds tighten capacity assignments with per-card power and skill coefficients.
 * They remain proof helpers only when every score contribution is an optimistic estimate.
 */

import {
  MEDLEY_CAPACITY_CARD_BOUND_DUAL_OBJECTIVE_GLOBAL_STATE_BUDGET,
  MEDLEY_CAPACITY_CARD_BOUND_DUAL_OBJECTIVE_STATE_BUDGET,
  MEDLEY_CARD_BOUND_BUCKETED_JOINT_GLOBAL_STATE_BUDGET,
  MEDLEY_CARD_BOUND_BUCKETED_JOINT_MIN_BUCKET_SIZE,
  MEDLEY_CARD_BOUND_SHARED_POWER_SKILL_BUCKET_SIZE,
  MEDLEY_CARD_BOUND_SHARED_POWER_SKILL_STATE_BUDGET,
  MEDLEY_CARD_BOUND_BUCKETED_JOINT_TARGET_BUCKET_COUNTS,
  MEDLEY_CARD_BOUND_LAGRANGIAN_WEIGHTS,
  MEDLEY_TEAM_COUNT,
  MEDLEY_TEAM_SIZE,
} from "../constants";
import {
  addMedleyCapacityBucketedJointState,
  addMedleyCapacityDualObjectiveState,
  cloneMedleyCapacityBucketedJointStateMap,
  getMedleyCapacityBucketedJointBucket,
  getMedleyCapacityBucketedJointStateBudget,
  getMedleyCapacityTransition,
  pruneMedleyCapacityBucketedJointStateMaps,
} from "./capacity-core";
import {
  getMedleyCardSkillAverageRateForContext,
  getMedleyCardSkillAverageRateUpper,
  getMedleyCardSkillLeaderRateForContext,
  getMedleyCardSkillLeaderRateUpper,
  medleyCardMatchesSkillContext,
} from "./skill-context";
import { insertTopValue } from "@/lib/bandori/team-builder/core";
import { calculateSkillScoreUpperBoundsForPower } from "@/lib/bandori/team-builder/core/scoring";
import type {
  BandoriMedleyTeamSearchProfilingStats,
  MedleyCapacityAssignmentWitness,
  MedleyCapacityBucketedJointUpperEstimate,
  MedleyCapacityCardsByCharacter,
  MedleyCapacityDualObjectiveState,
  MedleyCapacityWeightedUpperEstimate,
  MedleyCardBoundPowerUpperBySlot,
  MedleyCardSpecificCoefficientUpperBySlot,
  MedleyContextBoundUpperGroup,
  MedleySkillContextUpper,
  MedleySlotSearch,
  MedleySlotSkillCoefficientEstimate,
} from "../types";
import type { SearchCard } from "@/lib/bandori/team-builder/core";

type MedleyCardBoundSkillScoreUpper = {
  averageScore: number;
  leaderScore: number;
  leaderTotalScore: number;
};

type MedleySkillWindowScoreUpper = {
  averageScore: number;
  leaderScore: number;
};

export function buildMedleyCardBoundPowerUpperBySlot(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
): MedleyCardBoundPowerUpperBySlot {
  return remainingSlotIndices.map((slotIndex) => {
    const slot = slots[slotIndex];
    const bestPowerByCharacter = new Map<number, number>();
    for (const card of slot.searchCards) {
      if (bannedCardIds.has(card.cardId)) {
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
      if (bannedCardIds.has(card.cardId)) {
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

function buildMedleyCardBoundSkillScoreUpperBySlot(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardBoundPowerUpperBySlot: MedleyCardBoundPowerUpperBySlot,
): Array<Map<number, MedleyCardBoundSkillScoreUpper>> {
  return remainingSlotIndices.map((slotIndex, slotPosition) => {
    const slot = slots[slotIndex];
    const skillScoreUpperByCardId = new Map<number, MedleyCardBoundSkillScoreUpper>();
    const floorAwareCache = new Map<string, MedleySkillWindowScoreUpper>();
    for (const card of slot.searchCards) {
      const cardBoundPowerUpper = cardBoundPowerUpperBySlot[slotPosition].get(card.cardId);
      if (cardBoundPowerUpper === undefined || !Number.isFinite(cardBoundPowerUpper)) {
        continue;
      }

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
      const continuousAverageScore = cardBoundPowerUpper * getMedleyCardSkillAverageRateUpper(card);
      const continuousLeaderScore = cardBoundPowerUpper * getMedleyCardSkillLeaderRateUpper(card);
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
      skillScoreUpperByCardId.set(card.cardId, scoreUpper);
    }
    return skillScoreUpperByCardId;
  });
}

export function estimateMedleyCapacityCardBoundSkillAwareScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  cardBoundPowerUpperBySlot: MedleyCardBoundPowerUpperBySlot,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  const slotCount = remainingSlotIndices.length;
  if (profiling) {
    profiling.capacityCardBoundUpperCallCount += 1;
  }
  if (slotCount < 2 || slotCount > MEDLEY_TEAM_COUNT) {
    if (profiling) {
      profiling.capacityCardBoundUpperSkippedCount += 1;
    }
    return null;
  }

  const maskCount = 1 << slotCount;
  const leaderMaskCount = 1 << slotCount;
  const targetLeaderMask = leaderMaskCount - 1;
  const transition = getMedleyCapacityTransition(slotCount);
  const skillScoreUpperBySlot = buildMedleyCardBoundSkillScoreUpperBySlot(
    slots,
    remainingSlotIndices,
    cardBoundPowerUpperBySlot,
  );
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
            const cardBoundPowerUpper = cardBoundPowerUpperBySlot[slotPosition].get(card.cardId);
            if (cardBoundPowerUpper === undefined || !Number.isFinite(cardBoundPowerUpper)) {
              continue;
            }
            const skillScoreUpper = skillScoreUpperBySlot[slotPosition].get(card.cardId);
            if (!skillScoreUpper) {
              continue;
            }

            const nextMask = mask | (1 << slotPosition);
            const baseContribution = card.effectivePower
              * slots[remainingSlotIndices[slotPosition]].baseScoreRatePerPower
            const averageContribution = baseContribution + skillScoreUpper.averageScore;
            const nextIndex = nextMask * leaderMaskCount + leaderMask;
            nextCharacterOptions[nextIndex] = Math.max(
              nextCharacterOptions[nextIndex],
              currentValue + averageContribution,
            );

            const leaderBit = 1 << slotPosition;
            if ((leaderMask & leaderBit) === 0) {
              const nextLeaderMask = leaderMask | leaderBit;
              const leaderIndex = nextMask * leaderMaskCount + nextLeaderMask;
              nextCharacterOptions[leaderIndex] = Math.max(
                nextCharacterOptions[leaderIndex],
                currentValue
                  + baseContribution
                  + skillScoreUpper.leaderTotalScore,
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

  if (profiling) {
    profiling.capacityCardBoundUpperCompletedCount += 1;
  }
  return states[transition.targetIndex * leaderMaskCount + targetLeaderMask];
}

type MedleySharedPowerSkillUpperState = {
  baseScore: number;
  averageRate0: number;
  leaderRate0: number;
  averageRate1: number;
  leaderRate1: number;
  averageRate2: number;
  leaderRate2: number;
};

function createEmptySharedPowerSkillUpperState(): MedleySharedPowerSkillUpperState {
  return {
    baseScore: 0,
    averageRate0: 0,
    leaderRate0: 0,
    averageRate1: 0,
    leaderRate1: 0,
    averageRate2: 0,
    leaderRate2: 0,
  };
}

function sharedPowerSkillUpperStateDominates(
  left: MedleySharedPowerSkillUpperState,
  right: MedleySharedPowerSkillUpperState,
): boolean {
  return (
    left.baseScore + 0.000001 >= right.baseScore
    && left.averageRate0 + 1e-9 >= right.averageRate0
    && left.leaderRate0 + 1e-9 >= right.leaderRate0
    && left.averageRate1 + 1e-9 >= right.averageRate1
    && left.leaderRate1 + 1e-9 >= right.leaderRate1
    && left.averageRate2 + 1e-9 >= right.averageRate2
    && left.leaderRate2 + 1e-9 >= right.leaderRate2
  );
}

function addSharedPowerSkillUpperState(
  statesByKey: Map<number, MedleySharedPowerSkillUpperState[]>,
  key: number,
  nextState: MedleySharedPowerSkillUpperState,
): number {
  const states = statesByKey.get(key);
  if (!states) {
    statesByKey.set(key, [nextState]);
    return 1;
  }

  let writeIndex = 0;
  let removedCount = 0;
  for (let readIndex = 0; readIndex < states.length; readIndex += 1) {
    const state = states[readIndex];
    if (sharedPowerSkillUpperStateDominates(state, nextState)) {
      return 0;
    }
    if (sharedPowerSkillUpperStateDominates(nextState, state)) {
      removedCount += 1;
      continue;
    }
    states[writeIndex] = state;
    writeIndex += 1;
  }
  states.length = writeIndex;
  states.push(nextState);
  return 1 - removedCount;
}

function encodeSharedPowerSkillUpperKey(
  capacityIndex: number,
  leaderMask: number,
  bucket0: number,
  bucket1: number,
  bucket2: number,
  bucketBase: number,
  leaderMaskCount: number,
): number {
  return ((((capacityIndex * leaderMaskCount + leaderMask) * bucketBase + bucket0) * bucketBase + bucket1)
    * bucketBase + bucket2);
}

function decodeSharedPowerSkillUpperKey(
  key: number,
  bucketBase: number,
  leaderMaskCount: number,
): {
  capacityIndex: number;
  leaderMask: number;
  bucket0: number;
  bucket1: number;
  bucket2: number;
} {
  let rest = key;
  const bucket2 = rest % bucketBase;
  rest = Math.floor(rest / bucketBase);
  const bucket1 = rest % bucketBase;
  rest = Math.floor(rest / bucketBase);
  const bucket0 = rest % bucketBase;
  rest = Math.floor(rest / bucketBase);
  const leaderMask = rest % leaderMaskCount;
  const capacityIndex = Math.floor(rest / leaderMaskCount);
  return { capacityIndex, leaderMask, bucket0, bucket1, bucket2 };
}

function getSharedPowerSkillUpperStateBucket(
  powerUpperBound: number,
  bucketSize: number,
  bucketBase: number,
): number {
  if (!Number.isFinite(powerUpperBound) || powerUpperBound < 0) {
    return -1;
  }
  const bucket = Math.ceil(powerUpperBound / bucketSize);
  return bucket < bucketBase ? bucket : -1;
}

function getSharedPowerSkillUpperBucketValue(bucket: number, bucketSize: number): number {
  return bucket * bucketSize;
}

function addCardToSharedPowerSkillUpperState(
  state: MedleySharedPowerSkillUpperState,
  slot: MedleySlotSearch,
  slotPosition: number,
  card: SearchCard,
  asLeader: boolean,
): MedleySharedPowerSkillUpperState {
  const nextState = { ...state };
  nextState.baseScore += card.effectivePower * slot.baseScoreRatePerPower;
  const averageRate = getMedleyCardSkillAverageRateUpper(card);
  const leaderRate = asLeader ? getMedleyCardSkillLeaderRateUpper(card) : 0;
  if (slotPosition === 0) {
    nextState.averageRate0 += averageRate;
    nextState.leaderRate0 += leaderRate;
  } else if (slotPosition === 1) {
    nextState.averageRate1 += averageRate;
    nextState.leaderRate1 += leaderRate;
  } else {
    nextState.averageRate2 += averageRate;
    nextState.leaderRate2 += leaderRate;
  }
  return nextState;
}

function estimateMedleySharedPowerSkillSlotMaxPower(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
): number {
  const bestPowerByCharacter = new Map<number, number>();
  for (const card of slot.searchCards) {
    if (bannedCardIds.has(card.cardId)) {
      continue;
    }
    bestPowerByCharacter.set(
      card.characterId,
      Math.max(bestPowerByCharacter.get(card.characterId) ?? Number.NEGATIVE_INFINITY, card.effectivePower),
    );
  }
  return [...bestPowerByCharacter.values()]
    .sort((left, right) => right - left)
    .slice(0, MEDLEY_TEAM_SIZE)
    .reduce((sum, power) => sum + power, 0);
}

export function estimateMedleyCapacityCardBoundSharedPowerSkillScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  bannedCardIds: Set<number>,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
  options: {
    allowTwoSlot?: boolean;
    allowBannedCards?: boolean;
    stateBudget?: number | null;
  } = {},
): number | null {
  const slotCount = remainingSlotIndices.length;
  if (profiling) {
    profiling.capacityCardBoundSharedPowerUpperCallCount += 1;
    profiling.capacityCardBoundSharedPowerUpperBucketSize = MEDLEY_CARD_BOUND_SHARED_POWER_SKILL_BUCKET_SIZE;
  }
  const minSlotCount = options.allowTwoSlot === true ? 2 : MEDLEY_TEAM_COUNT;
  if (
    slotCount < minSlotCount
    || slotCount > MEDLEY_TEAM_COUNT
    || (options.allowBannedCards !== true && bannedCardIds.size > 0)
  ) {
    return null;
  }
  const stateBudget = (
    options.stateBudget !== null
    && options.stateBudget !== undefined
    && Number.isFinite(options.stateBudget)
  )
    ? Math.max(1, Math.trunc(options.stateBudget))
    : MEDLEY_CARD_BOUND_SHARED_POWER_SKILL_STATE_BUDGET;

  const bucketSize = MEDLEY_CARD_BOUND_SHARED_POWER_SKILL_BUCKET_SIZE;
  const maxPowerUpperBound = Math.max(
    ...remainingSlotIndices.map((slotIndex) => (
      estimateMedleySharedPowerSkillSlotMaxPower(slots[slotIndex], bannedCardIds)
    )),
  );
  if (!Number.isFinite(maxPowerUpperBound) || maxPowerUpperBound <= 0) {
    return null;
  }
  const bucketBase = Math.ceil(maxPowerUpperBound / bucketSize) + MEDLEY_TEAM_SIZE + 1;
  const leaderMaskCount = 1 << slotCount;
  const targetLeaderMask = leaderMaskCount - 1;
  const maskCount = 1 << slotCount;
  const transition = getMedleyCapacityTransition(slotCount);
  const abortWithStateCount = (count: number): null => {
    if (profiling) {
      profiling.capacityCardBoundSharedPowerUpperAbortCount += 1;
      profiling.capacityCardBoundSharedPowerUpperStateCount += count;
      profiling.capacityCardBoundSharedPowerUpperMaxStateCount = Math.max(
        profiling.capacityCardBoundSharedPowerUpperMaxStateCount,
        count,
      );
    }
    return null;
  };

  let statesByKey = new Map<number, MedleySharedPowerSkillUpperState[]>();
  let stateCount = 0;
  stateCount += addSharedPowerSkillUpperState(
    statesByKey,
    encodeSharedPowerSkillUpperKey(0, 0, 0, 0, 0, bucketBase, leaderMaskCount),
    createEmptySharedPowerSkillUpperState(),
  );

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptionsByKey = new Map<number, MedleySharedPowerSkillUpperState[]>();
    let characterOptionCount = 0;
    characterOptionCount += addSharedPowerSkillUpperState(
      characterOptionsByKey,
      encodeSharedPowerSkillUpperKey(0, 0, 0, 0, 0, bucketBase, leaderMaskCount),
      createEmptySharedPowerSkillUpperState(),
    );

    for (const slotCards of cardsById.values()) {
      const nextCharacterOptionsByKey = new Map<number, MedleySharedPowerSkillUpperState[]>();
      let nextCharacterOptionCount = characterOptionCount;
      for (const [key, states] of characterOptionsByKey.entries()) {
        nextCharacterOptionsByKey.set(key, states.slice());
      }

      for (const [key, states] of characterOptionsByKey.entries()) {
        const decoded = decodeSharedPowerSkillUpperKey(key, bucketBase, leaderMaskCount);
        for (const state of states) {
          for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
            if ((decoded.capacityIndex & (1 << slotPosition)) !== 0) {
              continue;
            }
            const card = slotCards[slotPosition];
            if (!card) {
              continue;
            }
            const buckets = [decoded.bucket0, decoded.bucket1, decoded.bucket2];
            const currentPowerUpper = getSharedPowerSkillUpperBucketValue(buckets[slotPosition] ?? 0, bucketSize);
            const nextBucket = getSharedPowerSkillUpperStateBucket(
              currentPowerUpper + card.effectivePower,
              bucketSize,
              bucketBase,
            );
            if (nextBucket < 0) {
              continue;
            }
            buckets[slotPosition] = nextBucket;
            const nextMask = decoded.capacityIndex | (1 << slotPosition);
            const averageKey = encodeSharedPowerSkillUpperKey(
              nextMask,
              decoded.leaderMask,
              buckets[0] ?? 0,
              buckets[1] ?? 0,
              buckets[2] ?? 0,
              bucketBase,
              leaderMaskCount,
            );
            nextCharacterOptionCount += addSharedPowerSkillUpperState(
              nextCharacterOptionsByKey,
              averageKey,
              addCardToSharedPowerSkillUpperState(
                state,
                slots[remainingSlotIndices[slotPosition]],
                slotPosition,
                card,
                false,
              ),
            );
            if (nextCharacterOptionCount > stateBudget) {
              return abortWithStateCount(nextCharacterOptionCount);
            }

            const leaderBit = 1 << slotPosition;
            if ((decoded.leaderMask & leaderBit) === 0) {
              const leaderKey = encodeSharedPowerSkillUpperKey(
                nextMask,
                decoded.leaderMask | leaderBit,
                buckets[0] ?? 0,
                buckets[1] ?? 0,
                buckets[2] ?? 0,
                bucketBase,
                leaderMaskCount,
              );
              nextCharacterOptionCount += addSharedPowerSkillUpperState(
                nextCharacterOptionsByKey,
                leaderKey,
                addCardToSharedPowerSkillUpperState(
                  state,
                  slots[remainingSlotIndices[slotPosition]],
                  slotPosition,
                  card,
                  true,
                ),
              );
              if (nextCharacterOptionCount > stateBudget) {
                return abortWithStateCount(nextCharacterOptionCount);
              }
            }
          }
        }
      }

      characterOptionsByKey = nextCharacterOptionsByKey;
      characterOptionCount = nextCharacterOptionCount;
      if (characterOptionCount > stateBudget) {
        return abortWithStateCount(characterOptionCount);
      }
    }

    const nextStatesByKey = new Map<number, MedleySharedPowerSkillUpperState[]>();
    let nextStateCount = stateCount;
    for (const [key, states] of statesByKey.entries()) {
      nextStatesByKey.set(key, states.slice());
    }

    for (const [stateKey, states] of statesByKey.entries()) {
      const decodedState = decodeSharedPowerSkillUpperKey(stateKey, bucketBase, leaderMaskCount);
      for (const [optionKey, optionStates] of characterOptionsByKey.entries()) {
        const decodedOption = decodeSharedPowerSkillUpperKey(optionKey, bucketBase, leaderMaskCount);
        if (
          decodedOption.capacityIndex === 0
          || (decodedState.leaderMask & decodedOption.leaderMask) !== 0
        ) {
          continue;
        }
        const nextCapacityIndex = transition.nextIndexByMask[
          decodedState.capacityIndex * maskCount + decodedOption.capacityIndex
        ];
        if (nextCapacityIndex < 0) {
          continue;
        }
        const nextBucket0 = getSharedPowerSkillUpperStateBucket(
          getSharedPowerSkillUpperBucketValue(decodedState.bucket0, bucketSize)
            + getSharedPowerSkillUpperBucketValue(decodedOption.bucket0, bucketSize),
          bucketSize,
          bucketBase,
        );
        const nextBucket1 = getSharedPowerSkillUpperStateBucket(
          getSharedPowerSkillUpperBucketValue(decodedState.bucket1, bucketSize)
            + getSharedPowerSkillUpperBucketValue(decodedOption.bucket1, bucketSize),
          bucketSize,
          bucketBase,
        );
        const nextBucket2 = getSharedPowerSkillUpperStateBucket(
          getSharedPowerSkillUpperBucketValue(decodedState.bucket2, bucketSize)
            + getSharedPowerSkillUpperBucketValue(decodedOption.bucket2, bucketSize),
          bucketSize,
          bucketBase,
        );
        if (nextBucket0 < 0 || nextBucket1 < 0 || nextBucket2 < 0) {
          continue;
        }
        const nextKey = encodeSharedPowerSkillUpperKey(
          nextCapacityIndex,
          decodedState.leaderMask | decodedOption.leaderMask,
          nextBucket0,
          nextBucket1,
          nextBucket2,
          bucketBase,
          leaderMaskCount,
        );
        for (const state of states) {
          for (const optionState of optionStates) {
            nextStateCount += addSharedPowerSkillUpperState(
              nextStatesByKey,
              nextKey,
              {
                baseScore: state.baseScore + optionState.baseScore,
                averageRate0: state.averageRate0 + optionState.averageRate0,
                leaderRate0: state.leaderRate0 + optionState.leaderRate0,
                averageRate1: state.averageRate1 + optionState.averageRate1,
                leaderRate1: state.leaderRate1 + optionState.leaderRate1,
                averageRate2: state.averageRate2 + optionState.averageRate2,
                leaderRate2: state.leaderRate2 + optionState.leaderRate2,
              },
            );
            if (nextStateCount > stateBudget) {
              return abortWithStateCount(nextStateCount);
            }
          }
        }
      }
    }

    statesByKey = nextStatesByKey;
    stateCount = nextStateCount;
    if (stateCount > stateBudget) {
      return abortWithStateCount(stateCount);
    }
  }

  let upperBound = Number.NEGATIVE_INFINITY;
  for (const [key, states] of statesByKey.entries()) {
    const decoded = decodeSharedPowerSkillUpperKey(key, bucketBase, leaderMaskCount);
    if (decoded.capacityIndex !== transition.targetIndex || decoded.leaderMask !== targetLeaderMask) {
      continue;
    }
    const powerUpper0 = getSharedPowerSkillUpperBucketValue(decoded.bucket0, bucketSize);
    const powerUpper1 = getSharedPowerSkillUpperBucketValue(decoded.bucket1, bucketSize);
    const powerUpper2 = getSharedPowerSkillUpperBucketValue(decoded.bucket2, bucketSize);
    for (const state of states) {
      upperBound = Math.max(
        upperBound,
        state.baseScore
          + powerUpper0 * (state.averageRate0 + state.leaderRate0)
          + powerUpper1 * (state.averageRate1 + state.leaderRate1)
          + powerUpper2 * (state.averageRate2 + state.leaderRate2),
      );
    }
  }

  if (profiling) {
    profiling.capacityCardBoundSharedPowerUpperCompletedCount += 1;
    profiling.capacityCardBoundSharedPowerUpperStateCount += stateCount;
    profiling.capacityCardBoundSharedPowerUpperMaxStateCount = Math.max(
      profiling.capacityCardBoundSharedPowerUpperMaxStateCount,
      stateCount,
    );
  }
  return Number.isFinite(upperBound) ? upperBound : null;
}

export function estimateMedleyCapacityCardBoundWeightedScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  slotCoefficients: number[],
  cardBoundPowerUpperBySlot: MedleyCardBoundPowerUpperBySlot,
  coefficientWeight: number,
  cardSpecificCoefficientUpperBySlot?: MedleyCardSpecificCoefficientUpperBySlot,
): number {
  const slotCount = remainingSlotIndices.length;
  const cardBoundWeight = 1 - coefficientWeight;
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
            const cardBoundPowerUpper = cardBoundPowerUpperBySlot[slotPosition].get(card.cardId);
            if (cardBoundPowerUpper === undefined || !Number.isFinite(cardBoundPowerUpper)) {
              continue;
            }

            const coefficient = cardSpecificCoefficientUpperBySlot
              ? cardSpecificCoefficientUpperBySlot[slotPosition].get(card.cardId)
              : slotCoefficients[slotPosition];
            if (coefficient === undefined || !Number.isFinite(coefficient)) {
              continue;
            }

            const nextMask = mask | (1 << slotPosition);
            const coefficientContribution = card.effectivePower * coefficient;
            const cardBoundBaseContribution = card.effectivePower
              * slots[remainingSlotIndices[slotPosition]].baseScoreRatePerPower
              + cardBoundPowerUpper * getMedleyCardSkillAverageRateUpper(card);
            const weightedBaseContribution = coefficientWeight * coefficientContribution
              + cardBoundWeight * cardBoundBaseContribution;
            const nextIndex = nextMask * leaderMaskCount + leaderMask;
            nextCharacterOptions[nextIndex] = Math.max(
              nextCharacterOptions[nextIndex],
              currentValue + weightedBaseContribution,
            );

            const leaderBit = 1 << slotPosition;
            if ((leaderMask & leaderBit) === 0) {
              const nextLeaderMask = leaderMask | leaderBit;
              const leaderIndex = nextMask * leaderMaskCount + nextLeaderMask;
              nextCharacterOptions[leaderIndex] = Math.max(
                nextCharacterOptions[leaderIndex],
                currentValue
                  + weightedBaseContribution
                  + cardBoundWeight * cardBoundPowerUpper * getMedleyCardSkillLeaderRateUpper(card),
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

  return states[transition.targetIndex * leaderMaskCount + targetLeaderMask];
}

export function estimateMedleyCapacityContextBoundWeightedScoreUpperBound(
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  contextBoundUpperBySlot: MedleyContextBoundUpperGroup[],
  coefficientWeight: number,
): number {
  const slotCount = remainingSlotIndices.length;
  const cardBoundWeight = 1 - coefficientWeight;
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
            const weightedBaseContribution = coefficientWeight * card.effectivePower * coefficient
              + cardBoundWeight * averageScore;
            const nextIndex = nextMask * leaderMaskCount + leaderMask;
            nextCharacterOptions[nextIndex] = Math.max(
              nextCharacterOptions[nextIndex],
              currentValue + weightedBaseContribution,
            );

            const leaderBit = 1 << slotPosition;
            if ((leaderMask & leaderBit) === 0) {
              const leaderScore = contextBoundUpper.leaderScoreUpperByCardId.get(card.cardId);
              if (leaderScore === undefined || !Number.isFinite(leaderScore)) {
                continue;
              }
              const nextLeaderMask = leaderMask | leaderBit;
              const leaderIndex = nextMask * leaderMaskCount + nextLeaderMask;
              nextCharacterOptions[leaderIndex] = Math.max(
                nextCharacterOptions[leaderIndex],
                currentValue + weightedBaseContribution + cardBoundWeight * leaderScore,
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

  return states[transition.targetIndex * leaderMaskCount + targetLeaderMask];
}

export function estimateMedleyCapacityCardBoundLagrangianScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  slotCoefficients: number[],
  cardBoundPowerUpperBySlot: MedleyCardBoundPowerUpperBySlot,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): MedleyCapacityWeightedUpperEstimate | null {
  const slotCount = remainingSlotIndices.length;
  if (slotCount < 2 || slotCount > MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityCardBoundLagrangianUpperCallCount += 1;
  }

  let bestUpperBound = Number.POSITIVE_INFINITY;
  let bestWeight = 0;
  for (const coefficientWeight of MEDLEY_CARD_BOUND_LAGRANGIAN_WEIGHTS) {
    const upperBound = estimateMedleyCapacityCardBoundWeightedScoreUpperBound(
      slots,
      remainingSlotIndices,
      cardsByCharacter,
      slotCoefficients,
      cardBoundPowerUpperBySlot,
      coefficientWeight,
    );
    if (Number.isFinite(upperBound) && upperBound < bestUpperBound) {
      bestUpperBound = upperBound;
      bestWeight = coefficientWeight;
    }
  }

  if (!Number.isFinite(bestUpperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityCardBoundLagrangianUpperCompletedCount += 1;
  }
  return {
    upperBound: bestUpperBound,
    weight: bestWeight,
  };
}

export function estimateMedleyCapacityCardSpecificLagrangianScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  slotCoefficients: number[],
  cardSpecificCoefficientUpperBySlot: MedleyCardSpecificCoefficientUpperBySlot,
  cardBoundPowerUpperBySlot: MedleyCardBoundPowerUpperBySlot,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): MedleyCapacityWeightedUpperEstimate | null {
  const slotCount = remainingSlotIndices.length;
  if (slotCount < 2 || slotCount > MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityCardSpecificLagrangianUpperCallCount += 1;
  }

  let bestUpperBound = Number.POSITIVE_INFINITY;
  let bestWeight = 0;
  for (const coefficientWeight of MEDLEY_CARD_BOUND_LAGRANGIAN_WEIGHTS) {
    const upperBound = estimateMedleyCapacityCardBoundWeightedScoreUpperBound(
      slots,
      remainingSlotIndices,
      cardsByCharacter,
      slotCoefficients,
      cardBoundPowerUpperBySlot,
      coefficientWeight,
      cardSpecificCoefficientUpperBySlot,
    );
    if (Number.isFinite(upperBound) && upperBound < bestUpperBound) {
      bestUpperBound = upperBound;
      bestWeight = coefficientWeight;
    }
  }

  if (!Number.isFinite(bestUpperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityCardSpecificLagrangianUpperCompletedCount += 1;
  }
  return {
    upperBound: bestUpperBound,
    weight: bestWeight,
  };
}

export function estimateMedleyCapacityCardBoundBucketedJointScoreUpperBoundForBucket(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  slotCoefficients: number[],
  cardBoundPowerUpperBySlot: MedleyCardBoundPowerUpperBySlot,
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
  const skillScoreUpperBySlot = buildMedleyCardBoundSkillScoreUpperBySlot(
    slots,
    remainingSlotIndices,
    cardBoundPowerUpperBySlot,
  );

  const abort = (): null => {
    if (profiling) {
      profiling.capacityCardBoundBucketedJointUpperAbortCount += 1;
      profiling.capacityCardBoundBucketedJointUpperStateCount += processedStateCount;
      profiling.capacityCardBoundBucketedJointUpperMaxProcessedStateCount = Math.max(
        profiling.capacityCardBoundBucketedJointUpperMaxProcessedStateCount,
        processedStateCount,
      );
      profiling.capacityCardBoundBucketedJointUpperBucketSize = bucketSize;
      profiling.capacityCardBoundBucketedJointUpperTargetBucketCount = targetBucketCount;
    }
    return null;
  };
  const accountState = (): boolean => {
    processedStateCount += 1;
    const totalStateCount = processedStateCount
      + (profiling?.capacityCardBoundBucketedJointUpperStateCount ?? 0);
    return (
      processedStateCount <= stateBudget
      && totalStateCount <= MEDLEY_CARD_BOUND_BUCKETED_JOINT_GLOBAL_STATE_BUDGET
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
          for (const [coefficientBucket, cardBoundScore] of states.entries()) {
            for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
              if ((mask & (1 << slotPosition)) !== 0) {
                continue;
              }
              const card = slotCards[slotPosition];
              if (!card) {
                continue;
              }
              const cardBoundPowerUpper = cardBoundPowerUpperBySlot[slotPosition].get(card.cardId);
              if (cardBoundPowerUpper === undefined || !Number.isFinite(cardBoundPowerUpper)) {
                continue;
              }
              const skillScoreUpper = skillScoreUpperBySlot[slotPosition].get(card.cardId);
              if (!skillScoreUpper) {
                continue;
              }

              const nextMask = mask | (1 << slotPosition);
              const coefficientContribution = card.effectivePower * slotCoefficients[slotPosition];
              const nextCoefficientBucket = getMedleyCapacityBucketedJointBucket(
                coefficientBucket * bucketSize + coefficientContribution,
                bucketSize,
              );
              const baseContribution = card.effectivePower
                * slots[remainingSlotIndices[slotPosition]].baseScoreRatePerPower
              const cardBoundBaseContribution = baseContribution + skillScoreUpper.averageScore;
              if (!accountState()) {
                return abort();
              }
              addMedleyCapacityBucketedJointState(
                nextCharacterOptions[nextMask * leaderMaskCount + leaderMask],
                nextCoefficientBucket,
                cardBoundScore + cardBoundBaseContribution,
              );

              const leaderBit = 1 << slotPosition;
              if ((leaderMask & leaderBit) === 0) {
                const nextLeaderMask = leaderMask | leaderBit;
                if (!accountState()) {
                  return abort();
                }
                addMedleyCapacityBucketedJointState(
                  nextCharacterOptions[nextMask * leaderMaskCount + nextLeaderMask],
                  nextCoefficientBucket,
                  cardBoundScore
                    + baseContribution
                    + skillScoreUpper.leaderTotalScore,
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
            for (const [coefficientBucket, cardBoundScore] of states.entries()) {
              for (const [optionCoefficientBucket, optionCardBoundScore] of options.entries()) {
                if (!accountState()) {
                  return abort();
                }
                addMedleyCapacityBucketedJointState(
                  nextStates,
                  coefficientBucket + optionCoefficientBucket,
                  cardBoundScore + optionCardBoundScore,
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
  for (const [coefficientBucket, cardBoundScore] of targetStates.entries()) {
    upperBound = Math.max(upperBound, Math.min(coefficientBucket * bucketSize, cardBoundScore));
  }
  if (!Number.isFinite(upperBound)) {
    return null;
  }

  if (profiling) {
    profiling.capacityCardBoundBucketedJointUpperCompletedCount += 1;
    profiling.capacityCardBoundBucketedJointUpperStateCount += processedStateCount;
    profiling.capacityCardBoundBucketedJointUpperMaxProcessedStateCount = Math.max(
      profiling.capacityCardBoundBucketedJointUpperMaxProcessedStateCount,
      processedStateCount,
    );
    profiling.capacityCardBoundBucketedJointUpperBucketSize = bucketSize;
    profiling.capacityCardBoundBucketedJointUpperTargetBucketCount = targetBucketCount;
  }
  return {
    upperBound,
    bucketSize,
    targetBucketCount,
  };
}

export function estimateMedleyCapacityCardBoundBucketedJointScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  slotCoefficients: number[],
  cardBoundPowerUpperBySlot: MedleyCardBoundPowerUpperBySlot,
  coefficientUpperBound: number,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): MedleyCapacityBucketedJointUpperEstimate | null {
  const slotCount = remainingSlotIndices.length;
  if (slotCount < 2 || slotCount > MEDLEY_TEAM_COUNT || !Number.isFinite(coefficientUpperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityCardBoundBucketedJointUpperCallCount += 1;
    if (
      profiling.capacityCardBoundBucketedJointUpperStateCount
        >= MEDLEY_CARD_BOUND_BUCKETED_JOINT_GLOBAL_STATE_BUDGET
    ) {
      profiling.capacityCardBoundBucketedJointUpperAbortCount += 1;
      return null;
    }
  }

  for (const targetBucketCount of MEDLEY_CARD_BOUND_BUCKETED_JOINT_TARGET_BUCKET_COUNTS) {
    const bucketSize = Math.max(
      MEDLEY_CARD_BOUND_BUCKETED_JOINT_MIN_BUCKET_SIZE,
      Math.ceil(coefficientUpperBound / targetBucketCount),
    );
    const stateBudget = getMedleyCapacityBucketedJointStateBudget(targetBucketCount);
    const estimate = estimateMedleyCapacityCardBoundBucketedJointScoreUpperBoundForBucket(
      slots,
      remainingSlotIndices,
      cardsByCharacter,
      slotCoefficients,
      cardBoundPowerUpperBySlot,
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

export function estimateMedleyCapacityCardBoundDualObjectiveScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  slotCoefficients: number[],
  cardBoundPowerUpperBySlot: MedleyCardBoundPowerUpperBySlot,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  const slotCount = remainingSlotIndices.length;
  if (slotCount < 2 || slotCount > MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityCardBoundDualUpperCallCount += 1;
    if (profiling.capacityCardBoundDualUpperStateCount >= MEDLEY_CAPACITY_CARD_BOUND_DUAL_OBJECTIVE_GLOBAL_STATE_BUDGET) {
      profiling.capacityCardBoundDualUpperAbortCount += 1;
      return null;
    }
  }

  const maskCount = 1 << slotCount;
  const leaderMaskCount = 1 << slotCount;
  const targetLeaderMask = leaderMaskCount - 1;
  const transition = getMedleyCapacityTransition(slotCount);
  const emptyState = {
    coefficientScore: 0,
    skillAwareScore: 0,
  };
  let processedStateCount = 0;
  const abort = (): null => {
    if (profiling) {
      profiling.capacityCardBoundDualUpperAbortCount += 1;
      profiling.capacityCardBoundDualUpperStateCount += processedStateCount;
      profiling.capacityCardBoundDualUpperMaxProcessedStateCount = Math.max(
        profiling.capacityCardBoundDualUpperMaxProcessedStateCount,
        processedStateCount,
      );
    }
    return null;
  };
  const accountState = (): boolean => {
    processedStateCount += 1;
    const totalStateCount = processedStateCount + (profiling?.capacityCardBoundDualUpperStateCount ?? 0);
    return (
      processedStateCount <= MEDLEY_CAPACITY_CARD_BOUND_DUAL_OBJECTIVE_STATE_BUDGET
      && totalStateCount <= MEDLEY_CAPACITY_CARD_BOUND_DUAL_OBJECTIVE_GLOBAL_STATE_BUDGET
    );
  };

  let statesByIndexAndLeaderMask: MedleyCapacityDualObjectiveState[][] = Array.from(
    { length: transition.stateCount * leaderMaskCount },
    () => [],
  );
  statesByIndexAndLeaderMask[0].push(emptyState);

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptions: MedleyCapacityDualObjectiveState[][] = Array.from(
      { length: maskCount * leaderMaskCount },
      () => [],
    );
    characterOptions[0].push(emptyState);

    for (const slotCards of cardsById.values()) {
      const nextCharacterOptions = characterOptions.map((states) => [...states]);
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
          const states = characterOptions[mask * leaderMaskCount + leaderMask];
          if (states.length === 0) {
            continue;
          }
          for (const state of states) {
            for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
              if ((mask & (1 << slotPosition)) !== 0) {
                continue;
              }
              const card = slotCards[slotPosition];
              if (!card) {
                continue;
              }
              const cardBoundPowerUpper = cardBoundPowerUpperBySlot[slotPosition].get(card.cardId);
              if (cardBoundPowerUpper === undefined || !Number.isFinite(cardBoundPowerUpper)) {
                continue;
              }
              if (!accountState()) {
                return abort();
              }

              const nextMask = mask | (1 << slotPosition);
              const coefficientContribution = card.effectivePower * slotCoefficients[slotPosition];
              const cardBoundBaseContribution = card.effectivePower
                * slots[remainingSlotIndices[slotPosition]].baseScoreRatePerPower
                + cardBoundPowerUpper * getMedleyCardSkillAverageRateUpper(card);
              addMedleyCapacityDualObjectiveState(
                nextCharacterOptions[nextMask * leaderMaskCount + leaderMask],
                {
                  coefficientScore: state.coefficientScore + coefficientContribution,
                  skillAwareScore: state.skillAwareScore + cardBoundBaseContribution,
                },
              );

              const leaderBit = 1 << slotPosition;
              if ((leaderMask & leaderBit) === 0) {
                const nextLeaderMask = leaderMask | leaderBit;
                if (!accountState()) {
                  return abort();
                }
                addMedleyCapacityDualObjectiveState(
                  nextCharacterOptions[nextMask * leaderMaskCount + nextLeaderMask],
                  {
                    coefficientScore: state.coefficientScore + coefficientContribution,
                    skillAwareScore: state.skillAwareScore
                      + cardBoundBaseContribution
                      + cardBoundPowerUpper * getMedleyCardSkillLeaderRateUpper(card),
                  },
                );
              }
            }
          }
        }
      }
      characterOptions = nextCharacterOptions;
    }

    const nextStatesByIndexAndLeaderMask = statesByIndexAndLeaderMask.map((states) => [...states]);
    for (let stateIndex = 0; stateIndex < transition.stateCount; stateIndex += 1) {
      for (let leaderMask = 0; leaderMask < leaderMaskCount; leaderMask += 1) {
        const states = statesByIndexAndLeaderMask[stateIndex * leaderMaskCount + leaderMask];
        if (states.length === 0) {
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
            if (options.length === 0) {
              continue;
            }
            const nextLeaderMask = leaderMask | characterLeaderMask;
            const nextStates = nextStatesByIndexAndLeaderMask[nextStateIndex * leaderMaskCount + nextLeaderMask];
            for (const state of states) {
              for (const option of options) {
                if (!accountState()) {
                  return abort();
                }
                addMedleyCapacityDualObjectiveState(
                  nextStates,
                  {
                    coefficientScore: state.coefficientScore + option.coefficientScore,
                    skillAwareScore: state.skillAwareScore + option.skillAwareScore,
                  },
                );
              }
            }
          }
        }
      }
    }
    statesByIndexAndLeaderMask = nextStatesByIndexAndLeaderMask;
  }

  if (profiling) {
    profiling.capacityCardBoundDualUpperCompletedCount += 1;
    profiling.capacityCardBoundDualUpperStateCount += processedStateCount;
    profiling.capacityCardBoundDualUpperMaxProcessedStateCount = Math.max(
      profiling.capacityCardBoundDualUpperMaxProcessedStateCount,
      processedStateCount,
    );
  }

  return statesByIndexAndLeaderMask[transition.targetIndex * leaderMaskCount + targetLeaderMask].reduce(
    (best, state) => Math.max(best, Math.min(state.coefficientScore, state.skillAwareScore)),
    Number.NEGATIVE_INFINITY,
  );
}

export function estimateMedleySlotEffectivePowerUpperBound(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
): number {
  const bestPowerByCharacter = new Map<number, number>();
  for (const card of slot.searchCards) {
    if (bannedCardIds.has(card.cardId)) {
      continue;
    }
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

export function estimateMedleySlotSkillCoefficient(
  slot: MedleySlotSearch,
  bannedCardIds: Set<number>,
): MedleySlotSkillCoefficientEstimate {
  const legacyTopAverageRates = [0, 0, 0, 0, 0];
  let legacyLeaderRate = 0;
  const averageRateByCharacter = new Map<number, number>();
  const leaderRateByCharacter = new Map<number, number>();

  for (const card of slot.searchCards) {
    if (bannedCardIds.has(card.cardId)) {
      continue;
    }
    const averageRate = getMedleyCardSkillAverageRateUpper(card);
    const leaderRate = getMedleyCardSkillLeaderRateUpper(card);
    insertTopValue(legacyTopAverageRates, averageRate);
    legacyLeaderRate = Math.max(legacyLeaderRate, leaderRate);
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
    return {
      coefficient: Number.NEGATIVE_INFINITY,
      legacyCoefficient: Number.NEGATIVE_INFINITY,
      improvement: 0,
    };
  }

  const ratesByCharacter = [...averageRateByCharacter.entries()];
  let bestCharacterDistinctSkillRate = Number.NEGATIVE_INFINITY;
  for (const [leaderCharacterId, leaderAverageRate] of ratesByCharacter) {
    const topOtherAverageRates = [0, 0, 0, 0];
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

  const legacySkillRate = legacyTopAverageRates.reduce((sum, averageRate) => sum + averageRate, legacyLeaderRate);
  return {
    coefficient: slot.baseScoreRatePerPower + bestCharacterDistinctSkillRate,
    legacyCoefficient: slot.baseScoreRatePerPower + legacySkillRate,
    improvement: Math.max(0, legacySkillRate - bestCharacterDistinctSkillRate),
  };
}

export function sumTopMedleyAverageRatesExcluding(
  sortedAverageRatesByCharacter: Array<[number, number]>,
  excludedCharacterId: number,
  secondExcludedCharacterId: number | null,
  count: number,
): number | null {
  let sum = 0;
  let selectedCount = 0;
  for (const [characterId, averageRate] of sortedAverageRatesByCharacter) {
    if (characterId === excludedCharacterId || characterId === secondExcludedCharacterId) {
      continue;
    }
    sum += averageRate;
    selectedCount += 1;
    if (selectedCount === count) {
      return sum;
    }
  }
  return null;
}

export function estimateMedleyCardSpecificSkillCoefficient(
  slot: MedleySlotSearch,
  card: SearchCard,
  sortedAverageRatesByCharacter: Array<[number, number]>,
  leaderComboRateByCharacter: Map<number, number>,
): number | null {
  const selfAverageRate = getMedleyCardSkillAverageRateUpper(card);
  const selfLeaderRate = getMedleyCardSkillLeaderRateUpper(card);
  const selfLeaderOtherAverageRateSum = sumTopMedleyAverageRatesExcluding(
    sortedAverageRatesByCharacter,
    card.characterId,
    null,
    MEDLEY_TEAM_SIZE - 1,
  );
  let bestSkillRate = selfLeaderOtherAverageRateSum === null
    ? Number.NEGATIVE_INFINITY
    : selfAverageRate + selfLeaderRate + selfLeaderOtherAverageRateSum;

  for (const [leaderCharacterId, leaderComboRate] of leaderComboRateByCharacter) {
    if (leaderCharacterId === card.characterId) {
      continue;
    }
    const otherAverageRateSum = sumTopMedleyAverageRatesExcluding(
      sortedAverageRatesByCharacter,
      card.characterId,
      leaderCharacterId,
      MEDLEY_TEAM_SIZE - 2,
    );
    if (otherAverageRateSum === null) {
      continue;
    }
    bestSkillRate = Math.max(bestSkillRate, selfAverageRate + leaderComboRate + otherAverageRateSum);
  }

  return Number.isFinite(bestSkillRate)
    ? slot.baseScoreRatePerPower + bestSkillRate
    : null;
}

export function estimateMedleyLeaderFixedCardSpecificSkillCoefficient(
  slot: MedleySlotSearch,
  card: SearchCard,
  sortedAverageRatesByCharacter: Array<[number, number]>,
  leaderCharacterId: number,
  leaderComboRate: number,
): number | null {
  const selfAverageRate = getMedleyCardSkillAverageRateUpper(card);
  if (leaderCharacterId === card.characterId) {
    const selfLeaderOtherAverageRateSum = sumTopMedleyAverageRatesExcluding(
      sortedAverageRatesByCharacter,
      card.characterId,
      null,
      MEDLEY_TEAM_SIZE - 1,
    );
    if (selfLeaderOtherAverageRateSum === null) {
      return null;
    }
    return slot.baseScoreRatePerPower
      + selfAverageRate
      + getMedleyCardSkillLeaderRateUpper(card)
      + selfLeaderOtherAverageRateSum;
  }

  const otherAverageRateSum = sumTopMedleyAverageRatesExcluding(
    sortedAverageRatesByCharacter,
    card.characterId,
    leaderCharacterId,
    MEDLEY_TEAM_SIZE - 2,
  );
  return otherAverageRateSum === null
    ? null
    : slot.baseScoreRatePerPower + selfAverageRate + leaderComboRate + otherAverageRateSum;
}

export function estimateMedleyContextFixedCardSpecificSkillCoefficient(
  slot: MedleySlotSearch,
  card: SearchCard,
  context: MedleySkillContextUpper,
  sortedAverageRatesByCharacter: Array<[number, number]>,
  leaderComboRateByCharacter: Map<number, number>,
): number | null {
  if (!medleyCardMatchesSkillContext(card, context)) {
    return null;
  }
  const selfAverageRate = getMedleyCardSkillAverageRateForContext(card, context.mode);
  const selfLeaderRate = getMedleyCardSkillLeaderRateForContext(card, context.mode);
  const selfLeaderOtherAverageRateSum = sumTopMedleyAverageRatesExcluding(
    sortedAverageRatesByCharacter,
    card.characterId,
    null,
    MEDLEY_TEAM_SIZE - 1,
  );
  let bestSkillRate = selfLeaderOtherAverageRateSum === null
    ? Number.NEGATIVE_INFINITY
    : selfAverageRate + selfLeaderRate + selfLeaderOtherAverageRateSum;

  for (const [leaderCharacterId, leaderComboRate] of leaderComboRateByCharacter) {
    if (leaderCharacterId === card.characterId) {
      continue;
    }
    const otherAverageRateSum = sumTopMedleyAverageRatesExcluding(
      sortedAverageRatesByCharacter,
      card.characterId,
      leaderCharacterId,
      MEDLEY_TEAM_SIZE - 2,
    );
    if (otherAverageRateSum === null) {
      continue;
    }
    bestSkillRate = Math.max(bestSkillRate, selfAverageRate + leaderComboRate + otherAverageRateSum);
  }

  return Number.isFinite(bestSkillRate)
    ? slot.baseScoreRatePerPower + bestSkillRate
    : null;
}

export function buildMedleyCardSpecificCoefficientUpperBySlot(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
): MedleyCardSpecificCoefficientUpperBySlot {
  return remainingSlotIndices.map((slotIndex) => {
    const slot = slots[slotIndex];
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

    const sortedAverageRatesByCharacter = [...averageRateByCharacter.entries()]
      .sort((left, right) => right[1] - left[1]);
    const coefficientUpperByCardId = new Map<number, number>();
    for (const card of slot.searchCards) {
      if (bannedCardIds.has(card.cardId)) {
        continue;
      }
      const coefficient = estimateMedleyCardSpecificSkillCoefficient(
        slot,
        card,
        sortedAverageRatesByCharacter,
        leaderComboRateByCharacter,
      );
      if (coefficient !== null && Number.isFinite(coefficient)) {
        coefficientUpperByCardId.set(card.cardId, coefficient);
      }
    }
    return coefficientUpperByCardId;
  });
}

export function estimateMedleyCapacityCardSpecificCoefficientScoreUpperBound(
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  cardSpecificCoefficientUpperBySlot: MedleyCardSpecificCoefficientUpperBySlot,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  const slotCount = remainingSlotIndices.length;
  if (slotCount < 2 || slotCount > MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityCardSpecificCoefficientUpperCallCount += 1;
  }

  const maskCount = 1 << slotCount;
  const transition = getMedleyCapacityTransition(slotCount);
  let states = new Float64Array(transition.stateCount);
  states.fill(Number.NEGATIVE_INFINITY);
  states[0] = 0;

  for (const cardsById of cardsByCharacter.values()) {
    let characterValues = new Float64Array(maskCount);
    characterValues.fill(Number.NEGATIVE_INFINITY);
    characterValues[0] = 0;
    for (const slotCards of cardsById.values()) {
      const nextCharacterValues = characterValues.slice();
      for (let mask = 0; mask < maskCount; mask += 1) {
        const currentValue = characterValues[mask];
        if (!Number.isFinite(currentValue)) {
          continue;
        }
        for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
          const card = slotCards[slotPosition];
          if ((mask & (1 << slotPosition)) !== 0 || !card) {
            continue;
          }
          const coefficient = cardSpecificCoefficientUpperBySlot[slotPosition].get(card.cardId);
          if (coefficient === undefined || !Number.isFinite(coefficient)) {
            continue;
          }
          const nextMask = mask | (1 << slotPosition);
          nextCharacterValues[nextMask] = Math.max(
            nextCharacterValues[nextMask],
            currentValue + card.effectivePower * coefficient,
          );
        }
      }
      characterValues = nextCharacterValues;
    }

    const nextStates = states.slice();
    for (let stateIndex = 0; stateIndex < states.length; stateIndex += 1) {
      const currentValue = states[stateIndex];
      if (!Number.isFinite(currentValue)) {
        continue;
      }
      for (let mask = 1; mask < maskCount; mask += 1) {
        const nextIndex = transition.nextIndexByMask[stateIndex * maskCount + mask];
        if (nextIndex < 0) {
          continue;
        }
        const characterValue = characterValues[mask];
        if (Number.isFinite(characterValue)) {
          nextStates[nextIndex] = Math.max(nextStates[nextIndex], currentValue + characterValue);
        }
      }
    }
    states = nextStates;
  }

  if (profiling) {
    profiling.capacityCardSpecificCoefficientUpperCompletedCount += 1;
  }
  const upperBound = states[transition.targetIndex];
  return Number.isFinite(upperBound) ? upperBound : null;
}

export function cloneMedleyCapacityAssignmentWitnessSlots(slots: SearchCard[][]): SearchCard[][] {
  return slots.map((cards) => [...cards]);
}

export function createEmptyMedleyCapacityAssignmentWitnessState(slotCount: number): {
  value: number;
  slots: SearchCard[][];
  contributions: number[];
} {
  return {
    value: 0,
    slots: Array.from({ length: slotCount }, () => []),
    contributions: new Array<number>(slotCount).fill(0),
  };
}

export function addCardToMedleyCapacityAssignmentWitnessState(
  state: {
    value: number;
    slots: SearchCard[][];
    contributions: number[];
  },
  slotPosition: number,
  card: SearchCard,
  contribution: number,
): {
  value: number;
  slots: SearchCard[][];
  contributions: number[];
} {
  const slots = cloneMedleyCapacityAssignmentWitnessSlots(state.slots);
  const contributions = [...state.contributions];
  slots[slotPosition].push(card);
  contributions[slotPosition] += contribution;
  return {
    value: state.value + contribution,
    slots,
    contributions,
  };
}

export function mergeMedleyCapacityAssignmentWitnessStates(
  left: {
    value: number;
    slots: SearchCard[][];
    contributions: number[];
  },
  right: {
    value: number;
    slots: SearchCard[][];
    contributions: number[];
  },
): {
  value: number;
  slots: SearchCard[][];
  contributions: number[];
} {
  return {
    value: left.value + right.value,
    slots: left.slots.map((cards, slotPosition) => [...cards, ...right.slots[slotPosition]]),
    contributions: left.contributions.map((value, slotPosition) => value + right.contributions[slotPosition]),
  };
}

export function replaceMedleyCapacityAssignmentWitnessStateIfBetter(
  states: Array<ReturnType<typeof createEmptyMedleyCapacityAssignmentWitnessState> | null>,
  index: number,
  candidate: ReturnType<typeof createEmptyMedleyCapacityAssignmentWitnessState>,
): void {
  const current = states[index];
  if (!current || candidate.value > current.value) {
    states[index] = candidate;
  }
}

export function estimateMedleyCapacityCardSpecificCoefficientAssignmentWitness(
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  cardSpecificCoefficientUpperBySlot: MedleyCardSpecificCoefficientUpperBySlot,
): MedleyCapacityAssignmentWitness | null {
  const slotCount = remainingSlotIndices.length;
  if (slotCount !== MEDLEY_TEAM_COUNT) {
    return null;
  }

  const maskCount = 1 << slotCount;
  const transition = getMedleyCapacityTransition(slotCount);
  let states: Array<ReturnType<typeof createEmptyMedleyCapacityAssignmentWitnessState> | null> = Array.from(
    { length: transition.stateCount },
    () => null,
  );
  states[0] = createEmptyMedleyCapacityAssignmentWitnessState(slotCount);

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptions: Array<ReturnType<typeof createEmptyMedleyCapacityAssignmentWitnessState> | null> = Array.from(
      { length: maskCount },
      () => null,
    );
    characterOptions[0] = createEmptyMedleyCapacityAssignmentWitnessState(slotCount);

    for (const slotCards of cardsById.values()) {
      const nextCharacterOptions = [...characterOptions];
      for (let mask = 0; mask < maskCount; mask += 1) {
        const current = characterOptions[mask];
        if (!current) {
          continue;
        }
        for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
          const card = slotCards[slotPosition];
          if ((mask & (1 << slotPosition)) !== 0 || !card) {
            continue;
          }
          const coefficient = cardSpecificCoefficientUpperBySlot[slotPosition].get(card.cardId);
          if (coefficient === undefined || !Number.isFinite(coefficient)) {
            continue;
          }
          const contribution = card.effectivePower * coefficient;
          const nextMask = mask | (1 << slotPosition);
          replaceMedleyCapacityAssignmentWitnessStateIfBetter(
            nextCharacterOptions,
            nextMask,
            addCardToMedleyCapacityAssignmentWitnessState(current, slotPosition, card, contribution),
          );
        }
      }
      characterOptions = nextCharacterOptions;
    }

    const nextStates = [...states];
    for (let stateIndex = 0; stateIndex < states.length; stateIndex += 1) {
      const current = states[stateIndex];
      if (!current) {
        continue;
      }
      for (let mask = 1; mask < maskCount; mask += 1) {
        const characterOption = characterOptions[mask];
        if (!characterOption) {
          continue;
        }
        const nextIndex = transition.nextIndexByMask[stateIndex * maskCount + mask];
        if (nextIndex < 0) {
          continue;
        }
        replaceMedleyCapacityAssignmentWitnessStateIfBetter(
          nextStates,
          nextIndex,
          mergeMedleyCapacityAssignmentWitnessStates(current, characterOption),
        );
      }
    }
    states = nextStates;
  }

  const target = states[transition.targetIndex];
  if (!target || !Number.isFinite(target.value) || target.slots.some((cards) => cards.length !== MEDLEY_TEAM_SIZE)) {
    return null;
  }
  return {
    upperBound: target.value,
    slots: target.slots.map((cards, slotPosition) => ({
      slotIndex: remainingSlotIndices[slotPosition],
      cards,
      upperContribution: target.contributions[slotPosition],
    })),
  };
}
