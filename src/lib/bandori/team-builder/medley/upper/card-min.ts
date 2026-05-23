/*
 * Card-min coefficient capacity upper model.
 *
 * This experimental model buckets cards by the minimum usable coefficient across remaining
 * slots. It is kept separate because its dominance pruning and state budgets differ from
 * the primary capacity assignment path.
 */

import {
  MEDLEY_CARD_MIN_COEFFICIENT_DOMINANCE_PRUNE_THRESHOLD,
  MEDLEY_CARD_MIN_COEFFICIENT_GLOBAL_STATE_BUDGET,
  MEDLEY_CARD_MIN_COEFFICIENT_STATE_BUDGET,
  MEDLEY_CARD_MIN_COEFFICIENT_TARGET_BUCKET_COUNTS,
  MEDLEY_TEAM_COUNT,
} from "../constants";
import { getMedleyCapacityTransition } from "./capacity-core";
import type {
  BandoriMedleyTeamSearchProfilingStats,
  MedleyCapacityCardMinCoefficientState,
  MedleyCapacityCardMinCoefficientUpperEstimate,
  MedleyCapacityCardsByCharacter,
  MedleyCardSpecificCoefficientUpperBySlot,
} from "../types";
import type { SearchCard } from "@/lib/bandori/team-builder/core";

export function getMedleyCapacityCardMinCoefficientBucket(coefficient: number, bucketSize: number): number {
  return Math.max(0, Math.ceil(Math.max(0, coefficient) / bucketSize));
}

export function getMedleyCapacityCardMinCoefficientStateBudget(targetBucketCount: number): number {
  if (targetBucketCount >= 256) {
    return 100_000;
  }
  if (targetBucketCount >= 128) {
    return 200_000;
  }
  if (targetBucketCount >= 64) {
    return 400_000;
  }
  if (targetBucketCount >= 32) {
    return 800_000;
  }
  return MEDLEY_CARD_MIN_COEFFICIENT_STATE_BUDGET;
}

export function createEmptyMedleyCapacityCardMinCoefficientState(initialBucket: number): MedleyCapacityCardMinCoefficientState {
  return {
    bucket0: initialBucket,
    power0: 0,
    bucket1: initialBucket,
    power1: 0,
    bucket2: initialBucket,
    power2: 0,
  };
}

export function getMedleyCapacityCardMinCoefficientKey(
  state: MedleyCapacityCardMinCoefficientState,
  bucketBase: number,
  slotCount: number,
): number {
  return state.bucket0
    + (slotCount >= 2 ? state.bucket1 * bucketBase : 0)
    + (slotCount >= 3 ? state.bucket2 * bucketBase * bucketBase : 0);
}

export function cloneMedleyCapacityCardMinCoefficientState(
  state: MedleyCapacityCardMinCoefficientState,
): MedleyCapacityCardMinCoefficientState {
  return { ...state };
}

export function cloneMedleyCapacityCardMinCoefficientStateMap(
  states: Map<number, MedleyCapacityCardMinCoefficientState>,
): Map<number, MedleyCapacityCardMinCoefficientState> {
  const nextStates = new Map<number, MedleyCapacityCardMinCoefficientState>();
  for (const [key, state] of states.entries()) {
    nextStates.set(key, cloneMedleyCapacityCardMinCoefficientState(state));
  }
  return nextStates;
}

export function addMedleyCapacityCardMinCoefficientState(
  states: Map<number, MedleyCapacityCardMinCoefficientState>,
  nextState: MedleyCapacityCardMinCoefficientState,
  slotCount: number,
  bucketBase: number,
): void {
  const key = getMedleyCapacityCardMinCoefficientKey(nextState, bucketBase, slotCount);
  const state = states.get(key);
  if (!state) {
    states.set(key, nextState);
    return;
  }

  state.power0 = Math.max(state.power0, nextState.power0);
  if (slotCount >= 2) {
    state.power1 = Math.max(state.power1, nextState.power1);
  }
  if (slotCount >= 3) {
    state.power2 = Math.max(state.power2, nextState.power2);
  }
}

export function medleyCapacityCardMinCoefficientStateDominates(
  left: MedleyCapacityCardMinCoefficientState,
  right: MedleyCapacityCardMinCoefficientState,
  slotCount: number,
): boolean {
  return left.bucket0 >= right.bucket0
    && left.power0 >= right.power0
    && (
      slotCount < 2
      || (left.bucket1 >= right.bucket1 && left.power1 >= right.power1)
    )
    && (
      slotCount < 3
      || (left.bucket2 >= right.bucket2 && left.power2 >= right.power2)
    );
}

export function pruneMedleyCapacityCardMinCoefficientDominatedStates(
  states: Map<number, MedleyCapacityCardMinCoefficientState>,
  slotCount: number,
): Map<number, MedleyCapacityCardMinCoefficientState> {
  if (states.size < MEDLEY_CARD_MIN_COEFFICIENT_DOMINANCE_PRUNE_THRESHOLD) {
    return states;
  }

  const entries = [...states.entries()];
  const isKept = new Array<boolean>(entries.length).fill(true);
  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    if (!isKept[leftIndex]) {
      continue;
    }
    const left = entries[leftIndex][1];
    for (let rightIndex = 0; rightIndex < entries.length; rightIndex += 1) {
      if (leftIndex === rightIndex || !isKept[rightIndex]) {
        continue;
      }
      const right = entries[rightIndex][1];
      if (medleyCapacityCardMinCoefficientStateDominates(left, right, slotCount)) {
        isKept[rightIndex] = false;
      } else if (medleyCapacityCardMinCoefficientStateDominates(right, left, slotCount)) {
        isKept[leftIndex] = false;
        break;
      }
    }
  }

  if (isKept.every(Boolean)) {
    return states;
  }

  const prunedStates = new Map<number, MedleyCapacityCardMinCoefficientState>();
  entries.forEach(([key, state], index) => {
    if (isKept[index]) {
      prunedStates.set(key, state);
    }
  });
  return prunedStates;
}

export function addCardToMedleyCapacityCardMinCoefficientState(
  state: MedleyCapacityCardMinCoefficientState,
  card: SearchCard,
  slotPosition: number,
  cardCoefficientBucket: number,
): MedleyCapacityCardMinCoefficientState {
  if (slotPosition === 0) {
    return {
      ...state,
      bucket0: Math.min(state.bucket0, cardCoefficientBucket),
      power0: state.power0 + card.effectivePower,
    };
  }
  if (slotPosition === 1) {
    return {
      ...state,
      bucket1: Math.min(state.bucket1, cardCoefficientBucket),
      power1: state.power1 + card.effectivePower,
    };
  }
  return {
    ...state,
    bucket2: Math.min(state.bucket2, cardCoefficientBucket),
    power2: state.power2 + card.effectivePower,
  };
}

export function combineMedleyCapacityCardMinCoefficientStates(
  left: MedleyCapacityCardMinCoefficientState,
  right: MedleyCapacityCardMinCoefficientState,
): MedleyCapacityCardMinCoefficientState {
  return {
    bucket0: Math.min(left.bucket0, right.bucket0),
    power0: left.power0 + right.power0,
    bucket1: Math.min(left.bucket1, right.bucket1),
    power1: left.power1 + right.power1,
    bucket2: Math.min(left.bucket2, right.bucket2),
    power2: left.power2 + right.power2,
  };
}

export function scoreMedleyCapacityCardMinCoefficientState(
  state: MedleyCapacityCardMinCoefficientState,
  bucketSize: number,
  slotCount: number,
): number {
  let score = state.power0 * state.bucket0 * bucketSize;
  if (slotCount >= 2) {
    score += state.power1 * state.bucket1 * bucketSize;
  }
  if (slotCount >= 3) {
    score += state.power2 * state.bucket2 * bucketSize;
  }
  return score;
}

export function estimateMedleyCapacityCardMinCoefficientScoreUpperBoundForBucket(
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  cardSpecificCoefficientUpperBySlot: MedleyCardSpecificCoefficientUpperBySlot,
  bucketSize: number,
  targetBucketCount: number,
  stateBudget: number,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): MedleyCapacityCardMinCoefficientUpperEstimate | null {
  const slotCount = remainingSlotIndices.length;
  const maskCount = 1 << slotCount;
  const transition = getMedleyCapacityTransition(slotCount);
  let maxBucket = 0;
  for (const coefficientUpperByCardId of cardSpecificCoefficientUpperBySlot) {
    for (const coefficient of coefficientUpperByCardId.values()) {
      maxBucket = Math.max(maxBucket, getMedleyCapacityCardMinCoefficientBucket(coefficient, bucketSize));
    }
  }
  if (maxBucket <= 0) {
    return null;
  }
  const initialBucket = maxBucket;
  const bucketBase = maxBucket + 2;
  let processedStateCount = 0;

  const abort = (): null => {
    if (profiling) {
      profiling.capacityCardMinCoefficientUpperAbortCount += 1;
      profiling.capacityCardMinCoefficientUpperStateCount += processedStateCount;
      profiling.capacityCardMinCoefficientUpperMaxProcessedStateCount = Math.max(
        profiling.capacityCardMinCoefficientUpperMaxProcessedStateCount,
        processedStateCount,
      );
      profiling.capacityCardMinCoefficientUpperBucketSize = bucketSize;
      profiling.capacityCardMinCoefficientUpperTargetBucketCount = targetBucketCount;
    }
    return null;
  };
  const accountState = (): boolean => {
    processedStateCount += 1;
    const totalStateCount = processedStateCount + (profiling?.capacityCardMinCoefficientUpperStateCount ?? 0);
    return (
      processedStateCount <= stateBudget
      && totalStateCount <= MEDLEY_CARD_MIN_COEFFICIENT_GLOBAL_STATE_BUDGET
    );
  };

  let statesByIndex: Array<Map<number, MedleyCapacityCardMinCoefficientState>> = Array.from(
    { length: transition.stateCount },
    () => new Map<number, MedleyCapacityCardMinCoefficientState>(),
  );
  addMedleyCapacityCardMinCoefficientState(
    statesByIndex[0],
    createEmptyMedleyCapacityCardMinCoefficientState(initialBucket),
    slotCount,
    bucketBase,
  );

  for (const cardsById of cardsByCharacter.values()) {
    let characterOptionsByMask: Array<Map<number, MedleyCapacityCardMinCoefficientState>> = Array.from(
      { length: maskCount },
      () => new Map<number, MedleyCapacityCardMinCoefficientState>(),
    );
    addMedleyCapacityCardMinCoefficientState(
      characterOptionsByMask[0],
      createEmptyMedleyCapacityCardMinCoefficientState(initialBucket),
      slotCount,
      bucketBase,
    );

    for (const slotCards of cardsById.values()) {
      const nextOptionsByMask = characterOptionsByMask.map(cloneMedleyCapacityCardMinCoefficientStateMap);
      for (let mask = 0; mask < maskCount; mask += 1) {
        for (const state of characterOptionsByMask[mask].values()) {
          for (let slotPosition = 0; slotPosition < slotCount; slotPosition += 1) {
            const card = slotCards[slotPosition];
            if (!card || (mask & (1 << slotPosition)) !== 0) {
              continue;
            }
            const coefficient = cardSpecificCoefficientUpperBySlot[slotPosition].get(card.cardId);
            if (coefficient === undefined || !Number.isFinite(coefficient)) {
              continue;
            }
            if (!accountState()) {
              return abort();
            }
            addMedleyCapacityCardMinCoefficientState(
              nextOptionsByMask[mask | (1 << slotPosition)],
              addCardToMedleyCapacityCardMinCoefficientState(
                state,
                card,
                slotPosition,
                getMedleyCapacityCardMinCoefficientBucket(coefficient, bucketSize),
              ),
              slotCount,
              bucketBase,
            );
          }
        }
      }
      characterOptionsByMask = nextOptionsByMask.map((states) => (
        pruneMedleyCapacityCardMinCoefficientDominatedStates(states, slotCount)
      ));
    }

    const nextStatesByIndex = statesByIndex.map(cloneMedleyCapacityCardMinCoefficientStateMap);
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
            addMedleyCapacityCardMinCoefficientState(
              nextStates,
              combineMedleyCapacityCardMinCoefficientStates(state, option),
              slotCount,
              bucketBase,
            );
          }
        }
      }
    }
    statesByIndex = nextStatesByIndex.map((states) => (
      pruneMedleyCapacityCardMinCoefficientDominatedStates(states, slotCount)
    ));
  }

  let upperBound = Number.NEGATIVE_INFINITY;
  for (const state of statesByIndex[transition.targetIndex].values()) {
    upperBound = Math.max(upperBound, scoreMedleyCapacityCardMinCoefficientState(state, bucketSize, slotCount));
  }
  if (!Number.isFinite(upperBound)) {
    return null;
  }

  if (profiling) {
    profiling.capacityCardMinCoefficientUpperCompletedCount += 1;
    profiling.capacityCardMinCoefficientUpperStateCount += processedStateCount;
    profiling.capacityCardMinCoefficientUpperMaxProcessedStateCount = Math.max(
      profiling.capacityCardMinCoefficientUpperMaxProcessedStateCount,
      processedStateCount,
    );
    profiling.capacityCardMinCoefficientUpperBucketSize = bucketSize;
    profiling.capacityCardMinCoefficientUpperTargetBucketCount = targetBucketCount;
  }
  return {
    upperBound,
    bucketSize,
    targetBucketCount,
  };
}

export function estimateMedleyCapacityCardMinCoefficientScoreUpperBound(
  remainingSlotIndices: number[],
  cardsByCharacter: MedleyCapacityCardsByCharacter,
  cardSpecificCoefficientUpperBySlot: MedleyCardSpecificCoefficientUpperBySlot,
  coefficientUpperBound: number,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): MedleyCapacityCardMinCoefficientUpperEstimate | null {
  const slotCount = remainingSlotIndices.length;
  if (slotCount < 2 || slotCount > MEDLEY_TEAM_COUNT || !Number.isFinite(coefficientUpperBound)) {
    return null;
  }
  if (profiling) {
    profiling.capacityCardMinCoefficientUpperCallCount += 1;
    if (profiling.capacityCardMinCoefficientUpperStateCount >= MEDLEY_CARD_MIN_COEFFICIENT_GLOBAL_STATE_BUDGET) {
      profiling.capacityCardMinCoefficientUpperAbortCount += 1;
      return null;
    }
  }

  for (const targetBucketCount of MEDLEY_CARD_MIN_COEFFICIENT_TARGET_BUCKET_COUNTS) {
    const bucketSize = Math.max(0.001, coefficientUpperBound / targetBucketCount / 250_000);
    const stateBudget = getMedleyCapacityCardMinCoefficientStateBudget(targetBucketCount);
    const estimate = estimateMedleyCapacityCardMinCoefficientScoreUpperBoundForBucket(
      remainingSlotIndices,
      cardsByCharacter,
      cardSpecificCoefficientUpperBySlot,
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
