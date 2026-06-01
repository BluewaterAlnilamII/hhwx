/*
 * Slot branch upper bounds for medley search.
 *
 * These helpers provide optimistic per-slot estimates under partial skill context. Every
 * returned value must be safe for pruning: it may be loose, but never below a feasible team.
 */

import { hasCharacterIndexInMask } from "@/lib/bandori/team-builder/core";
import type {
  BandoriMedleyTeamSearchProfilingStats,
  MedleySkillContextUpper,
  MedleySkillContextUpperMode,
  MedleySlotSearch,
} from "../types";
import type { SearchCard } from "@/lib/bandori/team-builder/core";

type ForcedSlotSkillContextInfo = {
  bandId?: number;
  attribute?: SearchCard["attribute"];
};

type UpperState = {
  power: number;
  averageRate: number;
  leaderRate: number;
};

const forcedSlotSkillContextInfoBySlot = new WeakMap<MedleySlotSearch, ForcedSlotSkillContextInfo | null>();
const forcedBothSkillContextUppersBySlot = new WeakMap<MedleySlotSearch, MedleySkillContextUpper[]>();

function addState(states: UpperState[], nextState: UpperState): void {
  let writeIndex = 0;
  for (let readIndex = 0; readIndex < states.length; readIndex += 1) {
    const state = states[readIndex];
    if (
      state.power >= nextState.power
      && state.averageRate >= nextState.averageRate
      && state.leaderRate >= nextState.leaderRate
    ) {
      return;
    }
    if (
      nextState.power < state.power
      || nextState.averageRate < state.averageRate
      || nextState.leaderRate < state.leaderRate
    ) {
      states[writeIndex] = state;
      writeIndex += 1;
    }
  }
  states.length = writeIndex;
  states.push(nextState);
}

function getForcedSlotSkillContextInfo(slot: MedleySlotSearch): ForcedSlotSkillContextInfo | null {
  const cached = forcedSlotSkillContextInfoBySlot.get(slot);
  if (cached !== undefined) {
    return cached;
  }

  const firstCard = slot.searchCards[0];
  const forcedInfo: ForcedSlotSkillContextInfo | null = firstCard
    ? {
      ...(firstCard.bandId !== null && slot.searchCards.every((card) => card.bandId === firstCard.bandId)
        ? { bandId: firstCard.bandId }
        : {}),
      ...(slot.searchCards.every((card) => card.attribute === firstCard.attribute)
        ? { attribute: firstCard.attribute }
        : {}),
    }
    : null;
  const normalizedInfo = forcedInfo && (forcedInfo.bandId !== undefined || forcedInfo.attribute !== undefined)
    ? forcedInfo
    : null;
  forcedSlotSkillContextInfoBySlot.set(slot, normalizedInfo);
  return normalizedInfo;
}

export function getMedleyCardSkillAverageRateForContext(card: SearchCard, mode: MedleySkillContextUpperMode): number {
  if (mode === "optimistic") {
    return card.skillAverageRate;
  }
  if (mode === "mixed") {
    return card.skillMixedAverageRate;
  }
  if (mode === "same-band") {
    return card.skillSameBandAverageRate;
  }
  if (mode === "same-attribute") {
    return card.skillSameAttributeAverageRate;
  }
  return card.skillBothAverageRate;
}

export function getMedleyCardSkillLeaderRateForContext(card: SearchCard, mode: MedleySkillContextUpperMode): number {
  if (mode === "optimistic") {
    return card.skillLeaderRate;
  }
  if (mode === "mixed") {
    return card.skillMixedLeaderRate;
  }
  if (mode === "same-band") {
    return card.skillSameBandLeaderRate;
  }
  if (mode === "same-attribute") {
    return card.skillSameAttributeLeaderRate;
  }
  return card.skillBothLeaderRate;
}

export function getMedleyCardSkillAverageRateUpper(card: SearchCard): number {
  return Math.max(
    card.skillAverageRate,
    card.skillSameBandAverageRate,
    card.skillSameAttributeAverageRate,
    card.skillBothAverageRate,
    card.skillMixedAverageRate,
  );
}

export function getMedleyCardSkillLeaderRateUpper(card: SearchCard): number {
  return Math.max(
    card.skillLeaderRate,
    card.skillSameBandLeaderRate,
    card.skillSameAttributeLeaderRate,
    card.skillBothLeaderRate,
    card.skillMixedLeaderRate,
  );
}

export function medleyCardMatchesSkillContext(card: SearchCard, context: MedleySkillContextUpper): boolean {
  if ((context.mode === "same-band" || context.mode === "both") && card.bandId !== context.bandId) {
    return false;
  }
  if ((context.mode === "same-attribute" || context.mode === "both") && card.attribute !== context.attribute) {
    return false;
  }
  return true;
}

export function getMedleyPossibleSameBandIds(slot: MedleySlotSearch, selectedCards: SearchCard[]): number[] {
  if (selectedCards.length === 0) {
    return slot.upperBoundIndex.bandIds;
  }

  const bandId = selectedCards[0]?.bandId ?? null;
  if (bandId === null || selectedCards.some((card) => card.bandId !== bandId)) {
    return [];
  }
  return [bandId];
}

export function getMedleyPossibleSameAttributes(slot: MedleySlotSearch, selectedCards: SearchCard[]): Array<SearchCard["attribute"]> {
  if (selectedCards.length === 0) {
    return [...new Set(slot.searchCards.map((card) => card.attribute))];
  }

  const attribute = selectedCards[0]?.attribute ?? null;
  if (attribute === null || selectedCards.some((card) => card.attribute !== attribute)) {
    return [];
  }
  return [attribute];
}

export function buildMedleySkillContextUppers(
  slot: MedleySlotSearch,
  selectedCards: SearchCard[],
): MedleySkillContextUpper[] {
  const forcedInfo = getForcedSlotSkillContextInfo(slot);
  if (forcedInfo?.bandId !== undefined && forcedInfo.attribute !== undefined) {
    let contexts = forcedBothSkillContextUppersBySlot.get(slot);
    if (!contexts) {
      contexts = [{ mode: "both", bandId: forcedInfo.bandId, attribute: forcedInfo.attribute }];
      forcedBothSkillContextUppersBySlot.set(slot, contexts);
    }
    return contexts;
  }
  if (forcedInfo?.bandId !== undefined) {
    const contexts: MedleySkillContextUpper[] = [{ mode: "same-band", bandId: forcedInfo.bandId }];
    for (const attribute of getMedleyPossibleSameAttributes(slot, selectedCards)) {
      contexts.push({ mode: "both", bandId: forcedInfo.bandId, attribute });
    }
    return contexts;
  }
  if (forcedInfo?.attribute !== undefined) {
    const contexts: MedleySkillContextUpper[] = [{ mode: "same-attribute", attribute: forcedInfo.attribute }];
    for (const bandId of getMedleyPossibleSameBandIds(slot, selectedCards)) {
      contexts.push({ mode: "both", bandId, attribute: forcedInfo.attribute });
    }
    return contexts;
  }

  const contexts: MedleySkillContextUpper[] = [{ mode: "mixed" }];
  const possibleSameBandIds = getMedleyPossibleSameBandIds(slot, selectedCards);
  const possibleSameAttributes = getMedleyPossibleSameAttributes(slot, selectedCards);

  for (const bandId of possibleSameBandIds) {
    contexts.push({ mode: "same-band", bandId });
  }
  for (const attribute of possibleSameAttributes) {
    contexts.push({ mode: "same-attribute", attribute });
  }
  for (const bandId of possibleSameBandIds) {
    for (const attribute of possibleSameAttributes) {
      contexts.push({ mode: "both", bandId, attribute });
    }
  }

  return contexts;
}

export function estimateMedleySlotBranchScoreUpperBoundForContext(
  slot: MedleySlotSearch,
  selectedCards: SearchCard[],
  startIndex: number,
  bannedCardIds: Set<number>,
  usedCharacterMaskLow: number,
  usedCharacterMaskHigh: number,
  selectedPower: number,
  context: MedleySkillContextUpper,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
): number {
  const remaining = 5 - selectedCards.length;
  const forcedInfo = getForcedSlotSkillContextInfo(slot);
  const contextMatchesAllSlotCards = (
    context.mode === "both"
    && forcedInfo?.bandId === context.bandId
    && forcedInfo?.attribute === context.attribute
  );
  if (!contextMatchesAllSlotCards && selectedCards.some((card) => !medleyCardMatchesSkillContext(card, context))) {
    return Number.NEGATIVE_INFINITY;
  }
  const selectedAverageRate = selectedCards.reduce(
    (sum, card) => sum + getMedleyCardSkillAverageRateForContext(card, context.mode),
    0,
  );
  const selectedLeaderRate = selectedCards.reduce(
    (max, card) => Math.max(max, getMedleyCardSkillLeaderRateForContext(card, context.mode)),
    0,
  );
  if (remaining === 0) {
    return Math.floor(selectedPower) * (slot.baseScoreRatePerPower + selectedAverageRate + selectedLeaderRate);
  }
  if (remaining === 1) {
    let bestUpperBound = Number.NEGATIVE_INFINITY;
    let stateCount = 0;
    for (let index = startIndex; index < slot.searchCards.length; index += 1) {
      const card = slot.searchCards[index];
      if (bannedCardIds.has(card.cardId) || (!contextMatchesAllSlotCards && !medleyCardMatchesSkillContext(card, context))) {
        continue;
      }
      const characterIndex = slot.upperBoundIndex.characterIndexById.get(card.characterId);
      if (
        characterIndex === undefined
        || hasCharacterIndexInMask(usedCharacterMaskLow, usedCharacterMaskHigh, characterIndex)
      ) {
        continue;
      }
      stateCount += 1;
      const power = selectedPower + card.effectivePower;
      const averageRate = selectedAverageRate + getMedleyCardSkillAverageRateForContext(card, context.mode);
      const leaderRate = Math.max(selectedLeaderRate, getMedleyCardSkillLeaderRateForContext(card, context.mode));
      bestUpperBound = Math.max(
        bestUpperBound,
        Math.floor(power) * (slot.baseScoreRatePerPower + averageRate + leaderRate),
      );
    }
    if (profiling) {
      profiling.slotBranchUpperBoundStateCount += stateCount;
    }
    return bestUpperBound;
  }
  if (remaining === 2) {
    const statesByCharacterIndex = new Map<number, UpperState[]>();
    for (let index = startIndex; index < slot.searchCards.length; index += 1) {
      const card = slot.searchCards[index];
      if (bannedCardIds.has(card.cardId) || (!contextMatchesAllSlotCards && !medleyCardMatchesSkillContext(card, context))) {
        continue;
      }
      const characterIndex = slot.upperBoundIndex.characterIndexById.get(card.characterId);
      if (
        characterIndex === undefined
        || hasCharacterIndexInMask(usedCharacterMaskLow, usedCharacterMaskHigh, characterIndex)
      ) {
        continue;
      }
      let states = statesByCharacterIndex.get(characterIndex);
      if (!states) {
        states = [];
        statesByCharacterIndex.set(characterIndex, states);
      }
      addState(states, {
        power: card.effectivePower,
        averageRate: getMedleyCardSkillAverageRateForContext(card, context.mode),
        leaderRate: getMedleyCardSkillLeaderRateForContext(card, context.mode),
      });
    }

    const groupedStates = [...statesByCharacterIndex.values()];
    if (groupedStates.length < remaining) {
      return Number.NEGATIVE_INFINITY;
    }

    let bestUpperBound = Number.NEGATIVE_INFINITY;
    let stateCount = groupedStates.reduce((sum, states) => sum + states.length, 0);
    for (let leftGroupIndex = 0; leftGroupIndex < groupedStates.length - 1; leftGroupIndex += 1) {
      const leftStates = groupedStates[leftGroupIndex];
      for (let rightGroupIndex = leftGroupIndex + 1; rightGroupIndex < groupedStates.length; rightGroupIndex += 1) {
        const rightStates = groupedStates[rightGroupIndex];
        for (const leftState of leftStates) {
          const leftPower = selectedPower + leftState.power;
          const leftAverageRate = selectedAverageRate + leftState.averageRate;
          const leftLeaderRate = Math.max(selectedLeaderRate, leftState.leaderRate);
          for (const rightState of rightStates) {
            stateCount += 1;
            const power = leftPower + rightState.power;
            const averageRate = leftAverageRate + rightState.averageRate;
            const leaderRate = Math.max(leftLeaderRate, rightState.leaderRate);
            bestUpperBound = Math.max(
              bestUpperBound,
              Math.floor(power) * (slot.baseScoreRatePerPower + averageRate + leaderRate),
            );
          }
        }
      }
    }
    if (profiling) {
      profiling.slotBranchUpperBoundStateCount += stateCount;
    }
    return bestUpperBound;
  }

  const cardsByCharacterIndex = new Map<number, SearchCard[]>();
  for (let index = startIndex; index < slot.searchCards.length; index += 1) {
    const card = slot.searchCards[index];
    if (bannedCardIds.has(card.cardId)) {
      continue;
    }
    if (!contextMatchesAllSlotCards && !medleyCardMatchesSkillContext(card, context)) {
      continue;
    }
    const characterIndex = slot.upperBoundIndex.characterIndexById.get(card.characterId);
    if (characterIndex === undefined || hasCharacterIndexInMask(usedCharacterMaskLow, usedCharacterMaskHigh, characterIndex)) {
      continue;
    }
    const cards = cardsByCharacterIndex.get(characterIndex) ?? [];
    cards.push(card);
    cardsByCharacterIndex.set(characterIndex, cards);
  }

  if (cardsByCharacterIndex.size < remaining) {
    return Number.NEGATIVE_INFINITY;
  }

  let statesByCount: UpperState[][] = Array.from({ length: remaining + 1 }, () => []);
  statesByCount[0].push({
    power: selectedPower,
    averageRate: selectedAverageRate,
    leaderRate: selectedLeaderRate,
  });

  for (const cards of cardsByCharacterIndex.values()) {
    const nextStatesByCount = statesByCount.map((states) => [...states]);
    for (let count = 0; count < remaining; count += 1) {
      for (const state of statesByCount[count]) {
        for (const card of cards) {
          addState(nextStatesByCount[count + 1], {
            power: state.power + card.effectivePower,
            averageRate: state.averageRate + getMedleyCardSkillAverageRateForContext(card, context.mode),
            leaderRate: Math.max(state.leaderRate, getMedleyCardSkillLeaderRateForContext(card, context.mode)),
          });
        }
      }
    }
    statesByCount = nextStatesByCount;
  }

  if (profiling) {
    profiling.slotBranchUpperBoundStateCount += statesByCount.reduce((sum, states) => sum + states.length, 0);
  }
  return statesByCount[remaining].reduce((best, state) => Math.max(
    best,
    Math.floor(state.power) * (slot.baseScoreRatePerPower + state.averageRate + state.leaderRate),
  ), Number.NEGATIVE_INFINITY);
}

export function estimateMedleySlotBranchScoreUpperBound(
  slot: MedleySlotSearch,
  selectedCards: SearchCard[],
  startIndex: number,
  bannedCardIds: Set<number>,
  usedCharacterMaskLow: number,
  usedCharacterMaskHigh: number,
  selectedPower: number,
  profiling?: BandoriMedleyTeamSearchProfilingStats,
  useContextualSkillUpper = false,
): number {
  if (profiling) {
    profiling.slotBranchUpperBoundCallCount += 1;
  }

  const contexts = useContextualSkillUpper
    ? buildMedleySkillContextUppers(slot, selectedCards)
    : [{ mode: "optimistic" } satisfies MedleySkillContextUpper];
  return contexts.reduce((best, context) => Math.max(
    best,
    estimateMedleySlotBranchScoreUpperBoundForContext(
      slot,
      selectedCards,
      startIndex,
      bannedCardIds,
      usedCharacterMaskLow,
      usedCharacterMaskHigh,
      selectedPower,
      context,
      profiling,
    ),
  ), Number.NEGATIVE_INFINITY);
}
