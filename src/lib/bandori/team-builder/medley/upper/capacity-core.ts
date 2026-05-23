/*
 * Core capacity-state upper-bound primitives for medley search.
 *
 * These helpers relax card placement into per-slot capacity states. They are shared by
 * multiple upper models and must stay optimistic for every feasible disjoint assignment.
 */

import {
  MEDLEY_CAPACITY_BUCKETED_BUCKET_SIZE_STEP,
  MEDLEY_CAPACITY_BUCKETED_GLOBAL_STATE_BUDGET,
  MEDLEY_CAPACITY_BUCKETED_MIN_BUCKET_SIZE,
  MEDLEY_CAPACITY_BUCKETED_STATE_BUDGET,
  MEDLEY_CAPACITY_BUCKETED_TARGET_BUCKET_COUNT,
  MEDLEY_CAPACITY_DUAL_OBJECTIVE_STATE_BUDGET,
  MEDLEY_CAPACITY_PARETO_GLOBAL_STATE_BUDGET,
  MEDLEY_CAPACITY_PARETO_THREE_SLOT_CARD_RECORD_BUDGET,
  MEDLEY_CAPACITY_PARETO_THREE_SLOT_STATE_BUDGET,
  MEDLEY_CAPACITY_PARETO_TWO_SLOT_CARD_RECORD_BUDGET,
  MEDLEY_CAPACITY_PARETO_TWO_SLOT_STATE_BUDGET,
  MEDLEY_CARD_BOUND_BUCKETED_JOINT_STATE_BUDGET,
  MEDLEY_TEAM_COUNT,
  MEDLEY_TEAM_SIZE,
} from "../constants";
import { getMedleyCardSkillAverageRateUpper, getMedleyCardSkillLeaderRateUpper } from "./skill-context";
import type {
  BandoriMedleyTeamSearchProfilingStats,
  MedleyCapacityBucketedState,
  MedleyCapacityCardsByCharacter,
  MedleyCapacityDualObjectiveState,
  MedleyCapacityParetoState,
  MedleyCapacityTransition,
  MedleySlotSearch,
} from "../types";
import type { SearchCard } from "@/lib/bandori/team-builder/core";

export const medleyCapacityTransitionCache = new Map<number, MedleyCapacityTransition>();

export function getMedleyCapacityTransition(slotCount: number): MedleyCapacityTransition {
  const cached = medleyCapacityTransitionCache.get(slotCount);
  if (cached) {
    return cached;
  }

  const stateCount = (MEDLEY_TEAM_SIZE + 1) ** slotCount;
  const maskCount = 1 << slotCount;
  const nextIndexByMask = new Int16Array(stateCount * maskCount);
  nextIndexByMask.fill(-1);

  for (let stateIndex = 0; stateIndex < stateCount; stateIndex += 1) {
    const counts: number[] = [];
    let value = stateIndex;
    for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
      counts.push(value % (MEDLEY_TEAM_SIZE + 1));
      value = Math.floor(value / (MEDLEY_TEAM_SIZE + 1));
    }

    for (let mask = 0; mask < maskCount; mask += 1) {
      let nextIndex = 0;
      let multiplier = 1;
      let isValid = true;
      for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
        const nextCount = counts[slotPosition] + ((mask & (1 << slotPosition)) === 0 ? 0 : 1);
        if (nextCount > MEDLEY_TEAM_SIZE) {
          isValid = false;
          break;
        }
        nextIndex += nextCount * multiplier;
        multiplier *= MEDLEY_TEAM_SIZE + 1;
      }
      if (isValid) {
        nextIndexByMask[stateIndex * maskCount + mask] = nextIndex;
      }
    }
  }

  let targetIndex = 0;
  let multiplier = 1;
  for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
    targetIndex += MEDLEY_TEAM_SIZE * multiplier;
    multiplier *= MEDLEY_TEAM_SIZE + 1;
  }

  const transition = {
    nextIndexByMask,
    targetIndex,
    stateCount,
  };
  medleyCapacityTransitionCache.set(slotCount, transition);
  return transition;
}

export function createEmptyMedleyCapacityParetoState(): MedleyCapacityParetoState {
  return {
    power0: 0,
    averageRate0: 0,
    leaderRate0: 0,
    power1: 0,
    averageRate1: 0,
    leaderRate1: 0,
    power2: 0,
    averageRate2: 0,
    leaderRate2: 0,
  };
}

export function medleyCapacityParetoStateDominates(
  left: MedleyCapacityParetoState,
  right: MedleyCapacityParetoState,
  slotCount: number,
): boolean {
  if (
    left.power0 + 0.000001 < right.power0
    || left.averageRate0 + 0.000001 < right.averageRate0
    || left.leaderRate0 + 0.000001 < right.leaderRate0
  ) {
    return false;
  }
  if (
    slotCount >= 2
    && (
      left.power1 + 0.000001 < right.power1
      || left.averageRate1 + 0.000001 < right.averageRate1
      || left.leaderRate1 + 0.000001 < right.leaderRate1
    )
  ) {
    return false;
  }
  if (
    slotCount >= 3
    && (
      left.power2 + 0.000001 < right.power2
      || left.averageRate2 + 0.000001 < right.averageRate2
      || left.leaderRate2 + 0.000001 < right.leaderRate2
    )
  ) {
    return false;
  }
  return true;
}

export function addMedleyCapacityParetoState(
  states: MedleyCapacityParetoState[],
  nextState: MedleyCapacityParetoState,
  slotCount: number,
): boolean {
  for (const state of states) {
    if (medleyCapacityParetoStateDominates(state, nextState, slotCount)) {
      return false;
    }
  }

  for (let index = states.length - 1; index >= 0; index -= 1) {
    if (medleyCapacityParetoStateDominates(nextState, states[index], slotCount)) {
      states.splice(index, 1);
    }
  }
  states.push(nextState);
  return true;
}

export function addCardToMedleyCapacityParetoState(
  state: MedleyCapacityParetoState,
  card: SearchCard,
  slotPosition: number,
): MedleyCapacityParetoState {
  const averageRate = getMedleyCardSkillAverageRateUpper(card);
  const leaderRate = getMedleyCardSkillLeaderRateUpper(card);
  if (slotPosition === 0) {
    return {
      ...state,
      power0: state.power0 + card.effectivePower,
      averageRate0: state.averageRate0 + averageRate,
      leaderRate0: Math.max(state.leaderRate0, leaderRate),
    };
  }
  if (slotPosition === 1) {
    return {
      ...state,
      power1: state.power1 + card.effectivePower,
      averageRate1: state.averageRate1 + averageRate,
      leaderRate1: Math.max(state.leaderRate1, leaderRate),
    };
  }
  return {
    ...state,
    power2: state.power2 + card.effectivePower,
    averageRate2: state.averageRate2 + averageRate,
    leaderRate2: Math.max(state.leaderRate2, leaderRate),
  };
}

export function combineMedleyCapacityParetoStates(
  left: MedleyCapacityParetoState,
  right: MedleyCapacityParetoState,
): MedleyCapacityParetoState {
  return {
    power0: left.power0 + right.power0,
    averageRate0: left.averageRate0 + right.averageRate0,
    leaderRate0: Math.max(left.leaderRate0, right.leaderRate0),
    power1: left.power1 + right.power1,
    averageRate1: left.averageRate1 + right.averageRate1,
    leaderRate1: Math.max(left.leaderRate1, right.leaderRate1),
    power2: left.power2 + right.power2,
    averageRate2: left.averageRate2 + right.averageRate2,
    leaderRate2: Math.max(left.leaderRate2, right.leaderRate2),
  };
}

export function scoreMedleyCapacityParetoState(
  state: MedleyCapacityParetoState,
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
): number {
  let score = Math.floor(state.power0) * (
    slots[remainingSlotIndices[0]].baseScoreRatePerPower
    + state.averageRate0
    + state.leaderRate0
  );
  if (remainingSlotIndices.length >= 2) {
    score += Math.floor(state.power1) * (
      slots[remainingSlotIndices[1]].baseScoreRatePerPower
      + state.averageRate1
      + state.leaderRate1
    );
  }
  if (remainingSlotIndices.length >= 3) {
    score += Math.floor(state.power2) * (
      slots[remainingSlotIndices[2]].baseScoreRatePerPower
      + state.averageRate2
      + state.leaderRate2
    );
  }
  return score;
}

export function getMedleyCapacityBucketIndex(power: number, bucketSize: number): number {
  return Math.max(0, Math.ceil(Math.max(0, power) / bucketSize));
}

export function getMedleyCapacityBucketSize(slotPowerUpperBounds: number[]): number {
  const maxPower = Math.max(...slotPowerUpperBounds.filter(Number.isFinite), 0);
  const rawBucketSize = maxPower / MEDLEY_CAPACITY_BUCKETED_TARGET_BUCKET_COUNT;
  return Math.max(
    MEDLEY_CAPACITY_BUCKETED_MIN_BUCKET_SIZE,
    Math.ceil(rawBucketSize / MEDLEY_CAPACITY_BUCKETED_BUCKET_SIZE_STEP)
      * MEDLEY_CAPACITY_BUCKETED_BUCKET_SIZE_STEP,
  );
}

export function createEmptyMedleyCapacityBucketedState(): MedleyCapacityBucketedState {
  return {
    bucket0: 0,
    power0: 0,
    averageRate0: 0,
    leaderRate0: 0,
    bucket1: 0,
    power1: 0,
    averageRate1: 0,
    leaderRate1: 0,
    bucket2: 0,
    power2: 0,
    averageRate2: 0,
    leaderRate2: 0,
  };
}

export function getMedleyCapacityBucketedKey(
  state: MedleyCapacityBucketedState,
  bucketBase: number,
  slotCount: number,
): number {
  return state.bucket0
    + (slotCount >= 2 ? state.bucket1 * bucketBase : 0)
    + (slotCount >= 3 ? state.bucket2 * bucketBase * bucketBase : 0);
}

export function cloneMedleyCapacityBucketedState(
  state: MedleyCapacityBucketedState,
): MedleyCapacityBucketedState {
  return { ...state };
}

export function cloneMedleyCapacityBucketedStateMap(
  states: Map<number, MedleyCapacityBucketedState>,
): Map<number, MedleyCapacityBucketedState> {
  const nextStates = new Map<number, MedleyCapacityBucketedState>();
  for (const [key, state] of states.entries()) {
    nextStates.set(key, cloneMedleyCapacityBucketedState(state));
  }
  return nextStates;
}

export function addMedleyCapacityBucketedState(
  states: Map<number, MedleyCapacityBucketedState>,
  nextState: MedleyCapacityBucketedState,
  slotCount: number,
  bucketBase: number,
): void {
  const key = getMedleyCapacityBucketedKey(nextState, bucketBase, slotCount);
  const state = states.get(key);
  if (!state) {
    states.set(key, nextState);
    return;
  }

  state.power0 = Math.max(state.power0, nextState.power0);
  state.averageRate0 = Math.max(state.averageRate0, nextState.averageRate0);
  state.leaderRate0 = Math.max(state.leaderRate0, nextState.leaderRate0);
  if (slotCount >= 2) {
    state.power1 = Math.max(state.power1, nextState.power1);
    state.averageRate1 = Math.max(state.averageRate1, nextState.averageRate1);
    state.leaderRate1 = Math.max(state.leaderRate1, nextState.leaderRate1);
  }
  if (slotCount >= 3) {
    state.power2 = Math.max(state.power2, nextState.power2);
    state.averageRate2 = Math.max(state.averageRate2, nextState.averageRate2);
    state.leaderRate2 = Math.max(state.leaderRate2, nextState.leaderRate2);
  }
}

export function addCardToMedleyCapacityBucketedState(
  state: MedleyCapacityBucketedState,
  card: SearchCard,
  slotPosition: number,
  bucketSize: number,
): MedleyCapacityBucketedState {
  const averageRate = getMedleyCardSkillAverageRateUpper(card);
  const leaderRate = getMedleyCardSkillLeaderRateUpper(card);
  if (slotPosition === 0) {
    const power = state.power0 + card.effectivePower;
    return {
      ...state,
      bucket0: getMedleyCapacityBucketIndex(power, bucketSize),
      power0: power,
      averageRate0: state.averageRate0 + averageRate,
      leaderRate0: Math.max(state.leaderRate0, leaderRate),
    };
  }
  if (slotPosition === 1) {
    const power = state.power1 + card.effectivePower;
    return {
      ...state,
      bucket1: getMedleyCapacityBucketIndex(power, bucketSize),
      power1: power,
      averageRate1: state.averageRate1 + averageRate,
      leaderRate1: Math.max(state.leaderRate1, leaderRate),
    };
  }
  const power = state.power2 + card.effectivePower;
  return {
    ...state,
    bucket2: getMedleyCapacityBucketIndex(power, bucketSize),
    power2: power,
    averageRate2: state.averageRate2 + averageRate,
    leaderRate2: Math.max(state.leaderRate2, leaderRate),
  };
}

export function combineMedleyCapacityBucketedStates(
  left: MedleyCapacityBucketedState,
  right: MedleyCapacityBucketedState,
  bucketSize: number,
): MedleyCapacityBucketedState {
  const power0 = left.power0 + right.power0;
  const power1 = left.power1 + right.power1;
  const power2 = left.power2 + right.power2;
  return {
    bucket0: getMedleyCapacityBucketIndex(power0, bucketSize),
    power0,
    averageRate0: left.averageRate0 + right.averageRate0,
    leaderRate0: Math.max(left.leaderRate0, right.leaderRate0),
    bucket1: getMedleyCapacityBucketIndex(power1, bucketSize),
    power1,
    averageRate1: left.averageRate1 + right.averageRate1,
    leaderRate1: Math.max(left.leaderRate1, right.leaderRate1),
    bucket2: getMedleyCapacityBucketIndex(power2, bucketSize),
    power2,
    averageRate2: left.averageRate2 + right.averageRate2,
    leaderRate2: Math.max(left.leaderRate2, right.leaderRate2),
  };
}

export function scoreMedleyCapacityBucketedState(
  state: MedleyCapacityBucketedState,
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
): number {
  let score = Math.floor(state.power0) * (
    slots[remainingSlotIndices[0]].baseScoreRatePerPower
    + state.averageRate0
    + state.leaderRate0
  );
  if (remainingSlotIndices.length >= 2) {
    score += Math.floor(state.power1) * (
      slots[remainingSlotIndices[1]].baseScoreRatePerPower
      + state.averageRate1
      + state.leaderRate1
    );
  }
  if (remainingSlotIndices.length >= 3) {
    score += Math.floor(state.power2) * (
      slots[remainingSlotIndices[2]].baseScoreRatePerPower
      + state.averageRate2
      + state.leaderRate2
    );
  }
  return score;
}

export function estimateMedleyCapacityBucketedScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  slotPowerUpperBounds: number[],
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  const slotCount = remainingSlotIndices.length;
  if (slotCount < 2 || slotCount > MEDLEY_TEAM_COUNT || slotPowerUpperBounds.some((power) => !Number.isFinite(power))) {
    return null;
  }
  if (profiling) {
    profiling.capacityBucketedUpperCallCount += 1;
    if (profiling.capacityBucketedUpperStateCount >= MEDLEY_CAPACITY_BUCKETED_GLOBAL_STATE_BUDGET) {
      profiling.capacityBucketedUpperAbortCount += 1;
      return null;
    }
  }

  const bucketSize = getMedleyCapacityBucketSize(slotPowerUpperBounds);
  const maxBucket = Math.max(
    ...slotPowerUpperBounds.map((power) => getMedleyCapacityBucketIndex(power, bucketSize)),
    0,
  );
  const bucketBase = maxBucket + MEDLEY_TEAM_SIZE + 2;
  const maskCount = 1 << slotCount;
  const transition = getMedleyCapacityTransition(slotCount);
  const emptyState = createEmptyMedleyCapacityBucketedState();
  let processedStateCount = 0;

  const abort = (): null => {
    if (profiling) {
      profiling.capacityBucketedUpperAbortCount += 1;
      profiling.capacityBucketedUpperStateCount += processedStateCount;
      profiling.capacityBucketedUpperMaxProcessedStateCount = Math.max(
        profiling.capacityBucketedUpperMaxProcessedStateCount,
        processedStateCount,
      );
      profiling.capacityBucketedUpperBucketSize = bucketSize;
    }
    return null;
  };
  const accountState = (): boolean => {
    processedStateCount += 1;
    const totalStateCount = processedStateCount + (profiling?.capacityBucketedUpperStateCount ?? 0);
    return (
      processedStateCount <= MEDLEY_CAPACITY_BUCKETED_STATE_BUDGET
      && totalStateCount <= MEDLEY_CAPACITY_BUCKETED_GLOBAL_STATE_BUDGET
    );
  };

  let statesByIndex: Array<Map<number, MedleyCapacityBucketedState>> = Array.from(
    { length: transition.stateCount },
    () => new Map<number, MedleyCapacityBucketedState>(),
  );
  addMedleyCapacityBucketedState(statesByIndex[0], emptyState, slotCount, bucketBase);

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptionsByMask: Array<Map<number, MedleyCapacityBucketedState>> = Array.from(
      { length: maskCount },
      () => new Map<number, MedleyCapacityBucketedState>(),
    );
    addMedleyCapacityBucketedState(
      characterOptionsByMask[0],
      createEmptyMedleyCapacityBucketedState(),
      slotCount,
      bucketBase,
    );

    for (const slotCards of cardsById.values()) {
      const nextOptionsByMask = characterOptionsByMask.map(cloneMedleyCapacityBucketedStateMap);
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (const state of characterOptionsByMask[mask].values()) {
          for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
            const card = slotCards[slotPosition];
            if (!card || (mask & (1 << slotPosition)) !== 0) {
              continue;
            }
            if (!accountState()) {
              return abort();
            }
            addMedleyCapacityBucketedState(
              nextOptionsByMask[mask | (1 << slotPosition)],
              addCardToMedleyCapacityBucketedState(state, card, slotPosition, bucketSize),
              slotCount,
              bucketBase,
            );
          }
        }
      }
      characterOptionsByMask = nextOptionsByMask;
    }

    const nextStatesByIndex = statesByIndex.map(cloneMedleyCapacityBucketedStateMap);
    for (let stateIndex = 0; stateIndex < statesByIndex.length; stateIndex += 1) {
      const states = statesByIndex[stateIndex];
      if (states.size === 0) {
        continue;
      }
      for (let mask = 1; mask < maskCount; mask += 1) {
        const options = characterOptionsByMask[mask];
        if (options.size === 0) {
          continue;
        }
        const nextIndex = transition.nextIndexByMask[stateIndex * maskCount + mask];
        if (nextIndex < 0) {
          continue;
        }
        const nextStates = nextStatesByIndex[nextIndex];
        for (const state of states.values()) {
          for (const option of options.values()) {
            if (!accountState()) {
              return abort();
            }
            addMedleyCapacityBucketedState(
              nextStates,
              combineMedleyCapacityBucketedStates(state, option, bucketSize),
              slotCount,
              bucketBase,
            );
          }
        }
      }
    }
    statesByIndex = nextStatesByIndex;
  }

  if (profiling) {
    profiling.capacityBucketedUpperCompletedCount += 1;
    profiling.capacityBucketedUpperStateCount += processedStateCount;
    profiling.capacityBucketedUpperMaxProcessedStateCount = Math.max(
      profiling.capacityBucketedUpperMaxProcessedStateCount,
      processedStateCount,
    );
    profiling.capacityBucketedUpperBucketSize = bucketSize;
  }
  return [...statesByIndex[transition.targetIndex].values()].reduce(
    (best, state) => Math.max(best, scoreMedleyCapacityBucketedState(state, slots, remainingSlotIndices)),
    Number.NEGATIVE_INFINITY,
  );
}

export function medleyCapacityDualObjectiveStateDominates(
  left: MedleyCapacityDualObjectiveState,
  right: MedleyCapacityDualObjectiveState,
): boolean {
  return (
    left.coefficientScore + 0.000001 >= right.coefficientScore
    && left.skillAwareScore + 0.000001 >= right.skillAwareScore
  );
}

export function addMedleyCapacityDualObjectiveState(
  states: MedleyCapacityDualObjectiveState[],
  nextState: MedleyCapacityDualObjectiveState,
): boolean {
  for (const state of states) {
    if (medleyCapacityDualObjectiveStateDominates(state, nextState)) {
      return false;
    }
  }

  for (let index = states.length - 1; index >= 0; index -= 1) {
    if (medleyCapacityDualObjectiveStateDominates(nextState, states[index])) {
      states.splice(index, 1);
    }
  }
  states.push(nextState);
  return true;
}

export function getMedleyCapacityBucketedJointBucket(score: number, bucketSize: number): number {
  return Math.max(0, Math.ceil(Math.max(0, score) / bucketSize));
}

export function getMedleyCapacityBucketedJointStateBudget(targetBucketCount: number): number {
  if (targetBucketCount >= 1024) {
    return 75_000;
  }
  if (targetBucketCount >= 512) {
    return 150_000;
  }
  if (targetBucketCount >= 256) {
    return 300_000;
  }
  if (targetBucketCount >= 128) {
    return 600_000;
  }
  return MEDLEY_CARD_BOUND_BUCKETED_JOINT_STATE_BUDGET;
}

export function cloneMedleyCapacityBucketedJointStateMap(states: Map<number, number>): Map<number, number> {
  return new Map(states);
}

export function addMedleyCapacityBucketedJointState(
  states: Map<number, number>,
  coefficientBucket: number,
  cardBoundScore: number,
): void {
  const currentScore = states.get(coefficientBucket);
  if (currentScore === undefined || cardBoundScore > currentScore) {
    states.set(coefficientBucket, cardBoundScore);
  }
}

export function pruneMedleyCapacityBucketedJointStateMap(states: Map<number, number>): Map<number, number> {
  if (states.size <= 1) {
    return states;
  }

  const entries = [...states.entries()]
    .sort((left, right) => right[0] - left[0] || right[1] - left[1]);
  const pruned = new Map<number, number>();
  let bestCardBoundScore = Number.NEGATIVE_INFINITY;
  for (const [bucket, cardBoundScore] of entries) {
    if (cardBoundScore > bestCardBoundScore + 0.000001) {
      pruned.set(bucket, cardBoundScore);
      bestCardBoundScore = cardBoundScore;
    }
  }
  return pruned;
}

export function pruneMedleyCapacityBucketedJointStateMaps(statesByIndex: Array<Map<number, number>>): void {
  for (let index = 0; index < statesByIndex.length; index += 1) {
    statesByIndex[index] = pruneMedleyCapacityBucketedJointStateMap(statesByIndex[index]);
  }
}

export function estimateMedleyCapacityDualObjectiveScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  slotCoefficients: number[],
  slotPowerUpperBounds: number[],
  slotLeaderConstantSum: number,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  const slotCount = remainingSlotIndices.length;
  if (slotCount < 2 || slotCount > MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityParetoUpperCallCount += 1;
    if (profiling.capacityParetoUpperStateCount >= MEDLEY_CAPACITY_PARETO_GLOBAL_STATE_BUDGET) {
      profiling.capacityParetoUpperAbortCount += 1;
      return null;
    }
  }

  const maskCount = 1 << slotCount;
  const transition = getMedleyCapacityTransition(slotCount);
  const emptyState = {
    coefficientScore: 0,
    skillAwareScore: 0,
  };
  let processedStateCount = 0;
  const abort = (): null => {
    if (profiling) {
      profiling.capacityParetoUpperAbortCount += 1;
      profiling.capacityParetoUpperStateCount += processedStateCount;
      profiling.capacityParetoUpperMaxProcessedStateCount = Math.max(
        profiling.capacityParetoUpperMaxProcessedStateCount,
        processedStateCount,
      );
    }
    return null;
  };
  const accountState = (): boolean => {
    processedStateCount += 1;
    const totalStateCount = processedStateCount + (profiling?.capacityParetoUpperStateCount ?? 0);
    return (
      processedStateCount <= MEDLEY_CAPACITY_DUAL_OBJECTIVE_STATE_BUDGET
      && totalStateCount <= MEDLEY_CAPACITY_PARETO_GLOBAL_STATE_BUDGET
    );
  };

  let statesByIndex: MedleyCapacityDualObjectiveState[][] = Array.from(
    { length: transition.stateCount },
    () => [],
  );
  statesByIndex[0].push(emptyState);

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptionsByMask: MedleyCapacityDualObjectiveState[][] = Array.from({ length: maskCount }, () => []);
    characterOptionsByMask[0].push(emptyState);

    for (const slotCards of cardsById.values()) {
      const nextOptionsByMask = characterOptionsByMask.map((states) => [...states]);
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (const state of characterOptionsByMask[mask]) {
          for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
            const card = slotCards[slotPosition];
            if (!card || (mask & (1 << slotPosition)) !== 0) {
              continue;
            }
            if (!accountState()) {
              return abort();
            }
            addMedleyCapacityDualObjectiveState(
              nextOptionsByMask[mask | (1 << slotPosition)],
              {
                coefficientScore: state.coefficientScore + card.effectivePower * slotCoefficients[slotPosition],
                skillAwareScore: state.skillAwareScore
                  + card.effectivePower * slots[remainingSlotIndices[slotPosition]].baseScoreRatePerPower
                  + slotPowerUpperBounds[slotPosition] * getMedleyCardSkillAverageRateUpper(card),
              },
            );
          }
        }
      }
      characterOptionsByMask = nextOptionsByMask;
    }

    const nextStatesByIndex = statesByIndex.map((states) => [...states]);
    for (let stateIndex = 0; stateIndex < statesByIndex.length; stateIndex += 1) {
      const states = statesByIndex[stateIndex];
      if (states.length === 0) {
        continue;
      }
      for (let mask = 1; mask < maskCount; mask += 1) {
        const options = characterOptionsByMask[mask];
        if (options.length === 0) {
          continue;
        }
        const nextIndex = transition.nextIndexByMask[stateIndex * maskCount + mask];
        if (nextIndex < 0) {
          continue;
        }
        const nextStates = nextStatesByIndex[nextIndex];
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
    statesByIndex = nextStatesByIndex;
  }

  if (profiling) {
    profiling.capacityParetoUpperCompletedCount += 1;
    profiling.capacityParetoUpperStateCount += processedStateCount;
    profiling.capacityParetoUpperMaxProcessedStateCount = Math.max(
      profiling.capacityParetoUpperMaxProcessedStateCount,
      processedStateCount,
    );
  }
  return statesByIndex[transition.targetIndex].reduce(
    (best, state) => Math.max(
      best,
      Math.min(state.coefficientScore, state.skillAwareScore + slotLeaderConstantSum),
    ),
    Number.NEGATIVE_INFINITY,
  );
}

export function estimateMedleyCapacityParetoScoreUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number | null {
  const slotCount = remainingSlotIndices.length;
  if (slotCount < 2 || slotCount > MEDLEY_TEAM_COUNT) {
    return null;
  }
  if (profiling) {
    profiling.capacityParetoUpperCallCount += 1;
    if (profiling.capacityParetoUpperStateCount >= MEDLEY_CAPACITY_PARETO_GLOBAL_STATE_BUDGET) {
      profiling.capacityParetoUpperAbortCount += 1;
      return null;
    }
  }

  const maskCount = 1 << slotCount;
  const transition = getMedleyCapacityTransition(slotCount);
  const emptyState = createEmptyMedleyCapacityParetoState();
  const perCallStateBudget = slotCount >= MEDLEY_TEAM_COUNT
    ? MEDLEY_CAPACITY_PARETO_THREE_SLOT_STATE_BUDGET
    : MEDLEY_CAPACITY_PARETO_TWO_SLOT_STATE_BUDGET;
  const cardRecordBudget = slotCount >= MEDLEY_TEAM_COUNT
    ? MEDLEY_CAPACITY_PARETO_THREE_SLOT_CARD_RECORD_BUDGET
    : MEDLEY_CAPACITY_PARETO_TWO_SLOT_CARD_RECORD_BUDGET;
  const cardsByCharacter: MedleyCapacityCardsByCharacter = new Map();
  let cardRecordCount = 0;
  for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
    const slotIndex = remainingSlotIndices[slotPosition];
    for (const card of slots[slotIndex].searchCards) {
      if (bannedCardIds.has(card.cardId)) {
        continue;
      }
      cardRecordCount += 1;
      if (cardRecordCount > cardRecordBudget) {
        if (profiling) {
          profiling.capacityParetoUpperAbortCount += 1;
        }
        return null;
      }
      const cardsById = cardsByCharacter.get(card.characterId) ?? new Map<number, Array<SearchCard | undefined>>();
      const slotCards = cardsById.get(card.cardId) ?? new Array<SearchCard | undefined>(slotCount);
      slotCards[slotPosition] = card;
      cardsById.set(card.cardId, slotCards);
      cardsByCharacter.set(card.characterId, cardsById);
    }
  }

  let processedStateCount = 0;
  const abort = (): null => {
    if (profiling) {
      profiling.capacityParetoUpperAbortCount += 1;
      profiling.capacityParetoUpperStateCount += processedStateCount;
      profiling.capacityParetoUpperMaxProcessedStateCount = Math.max(
        profiling.capacityParetoUpperMaxProcessedStateCount,
        processedStateCount,
      );
    }
    return null;
  };
  const accountState = (): boolean => {
    processedStateCount += 1;
    const totalStateCount = processedStateCount + (profiling?.capacityParetoUpperStateCount ?? 0);
    return (
      processedStateCount <= perCallStateBudget
      && totalStateCount <= MEDLEY_CAPACITY_PARETO_GLOBAL_STATE_BUDGET
    );
  };

  let statesByIndex: MedleyCapacityParetoState[][] = Array.from(
    { length: transition.stateCount },
    () => [],
  );
  statesByIndex[0].push(emptyState);

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptionsByMask: MedleyCapacityParetoState[][] = Array.from({ length: maskCount }, () => []);
    characterOptionsByMask[0].push(emptyState);

    for (const slotCards of cardsById.values()) {
      const nextOptionsByMask = characterOptionsByMask.map((states) => [...states]);
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (const state of characterOptionsByMask[mask]) {
          for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
            const card = slotCards[slotPosition];
            if (!card || (mask & (1 << slotPosition)) !== 0) {
              continue;
            }
            if (!accountState()) {
              return abort();
            }
            addMedleyCapacityParetoState(
              nextOptionsByMask[mask | (1 << slotPosition)],
              addCardToMedleyCapacityParetoState(state, card, slotPosition),
              slotCount,
            );
          }
        }
      }
      characterOptionsByMask = nextOptionsByMask;
    }

    const nextStatesByIndex = statesByIndex.map((states) => [...states]);
    for (let stateIndex = 0; stateIndex < statesByIndex.length; stateIndex += 1) {
      const states = statesByIndex[stateIndex];
      if (states.length === 0) {
        continue;
      }
      for (let mask = 1; mask < maskCount; mask += 1) {
        const options = characterOptionsByMask[mask];
        if (options.length === 0) {
          continue;
        }
        const nextIndex = transition.nextIndexByMask[stateIndex * maskCount + mask];
        if (nextIndex < 0) {
          continue;
        }
        const nextStates = nextStatesByIndex[nextIndex];
        for (const state of states) {
          for (const option of options) {
            if (!accountState()) {
              return abort();
            }
            addMedleyCapacityParetoState(
              nextStates,
              combineMedleyCapacityParetoStates(state, option),
              slotCount,
            );
          }
        }
      }
    }
    statesByIndex = nextStatesByIndex;
  }

  if (profiling) {
    profiling.capacityParetoUpperCompletedCount += 1;
    profiling.capacityParetoUpperStateCount += processedStateCount;
    profiling.capacityParetoUpperMaxProcessedStateCount = Math.max(
      profiling.capacityParetoUpperMaxProcessedStateCount,
      processedStateCount,
    );
  }
  return statesByIndex[transition.targetIndex].reduce(
    (best, state) => Math.max(best, scoreMedleyCapacityParetoState(state, slots, remainingSlotIndices)),
    Number.NEGATIVE_INFINITY,
  );
}
