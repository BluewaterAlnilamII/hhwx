/*
 * Conflict branch-and-bound experiment for medley search.
 *
 * This path branches on duplicate-card conflicts between independently strong slot teams. It
 * is useful for diagnostics but can spend its node budget without tightening the global proof.
 */

import {
  compareMedleyResultLike,
  evaluateMedleySlotCandidateWithCache,
  releaseMedleyScoreOnlyTeamEvaluationCache,
} from "../candidates";
import { getMedleyPruningThreshold } from "../configurations";
import { MEDLEY_TEAM_COUNT, MEDLEY_TEAM_SIZE } from "../constants";
import { compareMedleyTeamCandidates } from "../optimization";
import { buildMedleyResult } from "../results";
import { estimateMedleySlotBranchScoreUpperBound } from "../upper/skill-context";
import {
  CHARACTER_MASK_SEGMENT_BITS,
  estimateSearchScopeScoreUpperBound,
  hasCharacterIndexInMask,
} from "@/lib/bandori/team-builder/core";
import type {
  BandoriMedleyTeamSearchProfilingStats,
  BandoriMedleyTeamSearchResult,
  BandoriMedleyTeamSearchStats,
  MedleyBestSlotTeamCacheEntry,
  MedleyConflictExactBnbResult,
  MedleyConflictExactNode,
  MedleyConstrainedSlotSolveResult,
  MedleyEvaluatedResultObserver,
  MedleySlotSearch,
  MedleySlotTeamConstraint,
  MedleyTeamCandidate,
} from "../types";
import type { BandoriAreaItemConfiguration, SearchCard } from "@/lib/bandori/team-builder/core";

export function getMedleyConstraintCacheKey(
  slotIndex: number,
  constraint: MedleySlotTeamConstraint,
  scoreOnly = false,
): string {
  return [
    slotIndex,
    scoreOnly ? "score-only" : "full",
    [...constraint.forcedCardIds].sort((left, right) => left - right).join(","),
    [...constraint.bannedCardIds].sort((left, right) => left - right).join(","),
  ].join("|");
}

export function cloneMedleyConflictNode(node: MedleyConflictExactNode): MedleyConflictExactNode {
  return {
    forcedCardIdsBySlot: node.forcedCardIdsBySlot.map((cardIds) => new Set(cardIds)),
    bannedCardIdsBySlot: node.bannedCardIdsBySlot.map((cardIds) => new Set(cardIds)),
    depth: node.depth + 1,
  };
}

export function isValidMedleyConflictNode(node: MedleyConflictExactNode): boolean {
  const ownerByCardId = new Map<number, number>();
  for (let slotIndex = 0; slotIndex < node.forcedCardIdsBySlot.length; slotIndex += 1) {
    for (const cardId of node.forcedCardIdsBySlot[slotIndex]) {
      if (node.bannedCardIdsBySlot[slotIndex].has(cardId)) {
        return false;
      }
      const owner = ownerByCardId.get(cardId);
      if (owner !== undefined && owner !== slotIndex) {
        return false;
      }
      ownerByCardId.set(cardId, slotIndex);
    }
  }
  return true;
}

export function findBestMedleySlotTeamWithConstraints(
  slot: MedleySlotSearch,
  constraint: MedleySlotTeamConstraint,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  isPastDeadline: () => boolean,
  deadlineAt: number,
  slotSolveNodeLimit: number,
  scoreOnly = false,
): MedleyConstrainedSlotSolveResult {
  profiling.conflictExactBnbSlotSolveCount += 1;
  if (constraint.forcedCardIds.size > MEDLEY_TEAM_SIZE) {
    return { aborted: false, candidate: null };
  }

  const cardById = new Map(slot.searchCards.map((card) => [card.cardId, card]));
  const forcedCards: SearchCard[] = [];
  const forcedCharacterIds = new Set<number>();
  let usedCharacterMaskLow = 0;
  let usedCharacterMaskHigh = 0;
  let selectedPower = 0;
  for (const cardId of [...constraint.forcedCardIds].sort((left, right) => left - right)) {
    if (constraint.bannedCardIds.has(cardId)) {
      return { aborted: false, candidate: null };
    }
    const card = cardById.get(cardId);
    if (!card || forcedCharacterIds.has(card.characterId)) {
      return { aborted: false, candidate: null };
    }
    const characterIndex = slot.upperBoundIndex.characterIndexById.get(card.characterId);
    if (characterIndex === undefined) {
      return { aborted: false, candidate: null };
    }
    const isLowCharacterMask = characterIndex < CHARACTER_MASK_SEGMENT_BITS;
    const characterBit = isLowCharacterMask
      ? 1 << characterIndex
      : 1 << (characterIndex - CHARACTER_MASK_SEGMENT_BITS);
    if (isLowCharacterMask) {
      usedCharacterMaskLow |= characterBit;
    } else {
      usedCharacterMaskHigh |= characterBit;
    }
    forcedCards.push(card);
    forcedCharacterIds.add(card.characterId);
    selectedPower += card.effectivePower;
  }

  const selectedCards = [...forcedCards];
  const forcedCardIds = new Set(forcedCards.map((card) => card.cardId));
  let solveNodeCount = 0;
  let best: MedleyTeamCandidate | null = null;
  let aborted = false;

  const visit = (
    startIndex: number,
    currentPower: number,
    currentMaskLow: number,
    currentMaskHigh: number,
  ): void => {
    if (aborted) {
      return;
    }
    solveNodeCount += 1;
    if (solveNodeCount > slotSolveNodeLimit || stats.timedOut || performance.now() >= deadlineAt || isPastDeadline()) {
      aborted = true;
      if (stats.timedOut || performance.now() >= deadlineAt) {
        stats.isExhaustive = false;
        stats.timedOut = true;
        stats.searchMode = "bounded";
      }
      return;
    }

    const remaining = MEDLEY_TEAM_SIZE - selectedCards.length;
    if (remaining === 0) {
      const candidate = evaluateMedleySlotCandidateWithCache(
        slot,
        [...selectedCards],
        server,
        perfectRate,
        stats,
        profiling,
        undefined,
        scoreOnly,
      );
      best = compareMedleyTeamCandidates(best, candidate);
      return;
    }
    if (slot.searchCards.length - startIndex < remaining) {
      return;
    }

    const minimumScore = best?.result.score ?? Number.NEGATIVE_INFINITY;
    const contextBranchScoreUpperBound = estimateSearchScopeScoreUpperBound(
      selectedCards,
      slot.upperBoundIndex,
      slot.searchCards,
      startIndex,
      currentMaskLow,
      currentMaskHigh,
      slot.baseScoreRatePerPower,
      undefined,
      currentPower,
    );
    if (!Number.isFinite(contextBranchScoreUpperBound) || contextBranchScoreUpperBound < minimumScore) {
      stats.prunedBranchCount += 1;
      return;
    }
    const bannedAwareBranchScoreUpperBound = estimateMedleySlotBranchScoreUpperBound(
      slot,
      selectedCards,
      startIndex,
      constraint.bannedCardIds,
      currentMaskLow,
      currentMaskHigh,
      currentPower,
      profiling,
      true,
    );
    const branchScoreUpperBound = Math.min(contextBranchScoreUpperBound, bannedAwareBranchScoreUpperBound);
    if (!Number.isFinite(branchScoreUpperBound) || branchScoreUpperBound < minimumScore) {
      stats.prunedBranchCount += 1;
      return;
    }

    for (let index = startIndex; index < slot.searchCards.length; index += 1) {
      const card = slot.searchCards[index];
      if (constraint.bannedCardIds.has(card.cardId) || forcedCardIds.has(card.cardId)) {
        continue;
      }
      const characterIndex = slot.upperBoundIndex.characterIndexById.get(card.characterId);
      if (characterIndex === undefined || hasCharacterIndexInMask(currentMaskLow, currentMaskHigh, characterIndex)) {
        continue;
      }
      const isLowCharacterMask = characterIndex < CHARACTER_MASK_SEGMENT_BITS;
      const characterBit = isLowCharacterMask
        ? 1 << characterIndex
        : 1 << (characterIndex - CHARACTER_MASK_SEGMENT_BITS);
      selectedCards.push(card);
      visit(
        index + 1,
        currentPower + card.effectivePower,
        isLowCharacterMask ? currentMaskLow | characterBit : currentMaskLow,
        isLowCharacterMask ? currentMaskHigh : currentMaskHigh | characterBit,
      );
      selectedCards.pop();
      if (aborted) {
        return;
      }
    }
  };

  visit(0, selectedPower, usedCharacterMaskLow, usedCharacterMaskHigh);
  return { aborted, candidate: aborted ? null : best };
}

export function findBestMedleySlotTeamWithConstraintsAndCache(
  cache: Map<string, MedleyBestSlotTeamCacheEntry>,
  slotIndex: number,
  slot: MedleySlotSearch,
  constraint: MedleySlotTeamConstraint,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  isPastDeadline: () => boolean,
  deadlineAt: number,
  slotSolveNodeLimit: number,
  scoreOnly = false,
): MedleyConstrainedSlotSolveResult {
  const key = getMedleyConstraintCacheKey(slotIndex, constraint, scoreOnly);
  const cached = cache.get(key);
  if (cached) {
    profiling.conflictExactBnbSlotCacheHitCount += 1;
    return { aborted: false, candidate: cached.candidate };
  }

  profiling.conflictExactBnbSlotCacheMissCount += 1;
  const result = findBestMedleySlotTeamWithConstraints(
    slot,
    constraint,
    server,
    perfectRate,
    stats,
    profiling,
    isPastDeadline,
    deadlineAt,
    slotSolveNodeLimit,
    scoreOnly,
  );
  if (!result.aborted) {
    cache.set(key, { candidate: result.candidate });
  }
  return result;
}

export function getMedleyConflictCardId(
  slots: MedleySlotSearch[],
  bestTeams: MedleyTeamCandidate[],
): number | null {
  const usage = new Map<number, { count: number; weightedScore: number }>();
  bestTeams.forEach((team, slotIndex) => {
    const slotWeight = 1 + slots[slotIndex].startCombo / 3000;
    for (const card of team.cards) {
      const current = usage.get(card.cardId) ?? { count: 0, weightedScore: 0 };
      current.count += 1;
      current.weightedScore += team.result.score * slotWeight;
      usage.set(card.cardId, current);
    }
  });

  return [...usage.entries()]
    .filter(([, value]) => value.count >= 2)
    .sort((left, right) => (
      right[1].count - left[1].count
      || right[1].weightedScore - left[1].weightedScore
      || left[0] - right[0]
    ))[0]?.[0] ?? null;
}

export function medleyConflictTeamsAreDisjoint(bestTeams: MedleyTeamCandidate[]): boolean {
  const usedCardIds = new Set<number>();
  for (const team of bestTeams) {
    for (const cardId of team.cardIds) {
      if (usedCardIds.has(cardId)) {
        return false;
      }
      usedCardIds.add(cardId);
    }
  }
  return true;
}

export function buildMedleyConflictChildNodes(
  node: MedleyConflictExactNode,
  bestTeams: MedleyTeamCandidate[],
  conflictCardId: number,
): MedleyConflictExactNode[] {
  const currentOwnerSlotIndices = bestTeams
    .map((team, slotIndex) => ({ team, slotIndex }))
    .filter(({ team }) => team.cardIds.includes(conflictCardId))
    .sort((left, right) => right.team.result.score - left.team.result.score || left.slotIndex - right.slotIndex)
    .map(({ slotIndex }) => slotIndex);
  const slotOrder = [
    ...currentOwnerSlotIndices,
    ...bestTeams.map((_, slotIndex) => slotIndex).filter((slotIndex) => !currentOwnerSlotIndices.includes(slotIndex)),
  ];
  const children: MedleyConflictExactNode[] = [];
  for (const ownerSlotIndex of slotOrder) {
    const child = cloneMedleyConflictNode(node);
    child.forcedCardIdsBySlot[ownerSlotIndex].add(conflictCardId);
    for (let slotIndex = 0; slotIndex < child.bannedCardIdsBySlot.length; slotIndex += 1) {
      if (slotIndex !== ownerSlotIndex) {
        child.bannedCardIdsBySlot[slotIndex].add(conflictCardId);
      }
    }
    if (isValidMedleyConflictNode(child)) {
      children.push(child);
    }
  }

  const unusedChild = cloneMedleyConflictNode(node);
  for (const bannedCardIds of unusedChild.bannedCardIdsBySlot) {
    bannedCardIds.add(conflictCardId);
  }
  if (isValidMedleyConflictNode(unusedChild)) {
    children.push(unusedChild);
  }
  return children;
}

export type MedleyConflictPairUpperBnbResult = {
  proved: boolean;
  upperBound: number | null;
  timedOut: boolean;
};

export function proveMedleyScoreOnlyPairUpperByConflictBnb(
  slots: [MedleySlotSearch, MedleySlotSearch],
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  isPastDeadline: () => boolean,
  deadlineAt: number,
  nodeLimit: number,
  slotSolveNodeLimit: number,
  initialBannedCardIds: readonly number[] = [],
  scoreOnly = true,
): MedleyConflictPairUpperBnbResult {
  const startedAt = performance.now();
  profiling.conflictPairUpperBnbCallCount += 1;
  const slotBestCache = new Map<string, MedleyBestSlotTeamCacheEntry>();
  const openNodes: MedleyConflictExactNode[] = [{
    forcedCardIdsBySlot: slots.map(() => new Set<number>()),
    bannedCardIdsBySlot: slots.map(() => new Set(initialBannedCardIds)),
    depth: 0,
  }];
  let bestPairScore = Number.NEGATIVE_INFINITY;
  let observedUpperBound = Number.NEGATIVE_INFINITY;
  const startNodeCount = profiling.conflictPairUpperBnbNodeCount;

  try {
    while (openNodes.length > 0) {
      profiling.conflictPairUpperBnbMaxOpenNodeCount = Math.max(
        profiling.conflictPairUpperBnbMaxOpenNodeCount,
        openNodes.length,
      );
      if (profiling.conflictPairUpperBnbNodeCount - startNodeCount >= nodeLimit) {
        profiling.conflictPairUpperBnbAbortCount += 1;
        return {
          proved: false,
          upperBound: Number.isFinite(observedUpperBound) ? observedUpperBound : null,
          timedOut: false,
        };
      }
      if (stats.timedOut || performance.now() >= deadlineAt || isPastDeadline()) {
        stats.isExhaustive = false;
        stats.timedOut = true;
        stats.searchMode = "bounded";
        profiling.conflictPairUpperBnbAbortCount += 1;
        return {
          proved: false,
          upperBound: Number.isFinite(observedUpperBound) ? observedUpperBound : null,
          timedOut: true,
        };
      }

      const node = openNodes.shift();
      if (!node) {
        break;
      }
      profiling.conflictPairUpperBnbNodeCount += 1;
      profiling.conflictPairUpperBnbMaxDepth = Math.max(profiling.conflictPairUpperBnbMaxDepth, node.depth);

      const bestTeams: MedleyTeamCandidate[] = [];
      let aborted = false;
      let infeasible = false;
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
        const solveResult = findBestMedleySlotTeamWithConstraintsAndCache(
          slotBestCache,
          slotIndex,
          slots[slotIndex],
          {
            forcedCardIds: node.forcedCardIdsBySlot[slotIndex],
            bannedCardIds: node.bannedCardIdsBySlot[slotIndex],
          },
          server,
          perfectRate,
          stats,
          profiling,
          isPastDeadline,
          deadlineAt,
          slotSolveNodeLimit,
          scoreOnly,
        );
        if (solveResult.aborted) {
          aborted = true;
          break;
        }
        if (!solveResult.candidate) {
          infeasible = true;
          break;
        }
        bestTeams.push(solveResult.candidate);
      }
      if (aborted) {
        profiling.conflictPairUpperBnbAbortCount += 1;
        return {
          proved: false,
          upperBound: Number.isFinite(observedUpperBound) ? observedUpperBound : null,
          timedOut: stats.timedOut,
        };
      }
      if (infeasible) {
        profiling.conflictPairUpperBnbPrunedNodeCount += 1;
        continue;
      }

      const upperBound = bestTeams.reduce((sum, team) => sum + team.result.score, 0);
      observedUpperBound = Math.max(observedUpperBound, upperBound);
      const gap = Math.max(0, upperBound - bestPairScore);
      if (upperBound > (profiling.conflictPairUpperBnbBestUpper ?? Number.NEGATIVE_INFINITY)) {
        profiling.conflictPairUpperBnbBestUpper = upperBound;
        profiling.conflictPairUpperBnbBestGap = gap;
      }
      if (upperBound <= bestPairScore) {
        profiling.conflictPairUpperBnbPrunedNodeCount += 1;
        continue;
      }

      if (medleyConflictTeamsAreDisjoint(bestTeams)) {
        bestPairScore = Math.max(bestPairScore, upperBound);
        profiling.conflictPairUpperBnbSolvedNodeCount += 1;
        continue;
      }

      const conflictCardId = getMedleyConflictCardId(slots, bestTeams);
      if (conflictCardId === null) {
        profiling.conflictPairUpperBnbPrunedNodeCount += 1;
        continue;
      }

      const children = buildMedleyConflictChildNodes(node, bestTeams, conflictCardId);
      openNodes.unshift(...children);
    }

    profiling.conflictPairUpperBnbCompletedCount += 1;
    return {
      proved: true,
      upperBound: Number.isFinite(bestPairScore) ? bestPairScore : null,
      timedOut: false,
    };
  } finally {
    profiling.conflictPairUpperBnbElapsedMs += performance.now() - startedAt;
    for (const slot of slots) {
      releaseMedleyScoreOnlyTeamEvaluationCache(slot);
    }
    slotBestCache.clear();
  }
}

export function searchMedleyConfigurationByConflictExactBnb(
  results: BandoriMedleyTeamSearchResult[],
  resultLimit: number,
  slots: MedleySlotSearch[],
  configuration: BandoriAreaItemConfiguration,
  server: number,
  perfectRate: number,
  stats: BandoriMedleyTeamSearchStats,
  profiling: BandoriMedleyTeamSearchProfilingStats,
  isPastDeadline: () => boolean,
  deadlineAt: number,
  nodeLimit: number,
  slotSolveNodeLimit: number,
  observeEvaluatedResult?: MedleyEvaluatedResultObserver,
): MedleyConflictExactBnbResult {
  profiling.conflictExactBnbCallCount += 1;
  if (resultLimit !== 1 || slots.length !== MEDLEY_TEAM_COUNT || results.length < resultLimit) {
    profiling.conflictExactBnbAbortCount += 1;
    return { proved: false, result: null, observedUpperBound: null };
  }

  const slotBestCache = new Map<string, MedleyBestSlotTeamCacheEntry>();
  const openNodes: MedleyConflictExactNode[] = [{
    forcedCardIdsBySlot: slots.map(() => new Set<number>()),
    bannedCardIdsBySlot: slots.map(() => new Set<number>()),
    depth: 0,
  }];
  let incumbentScore = getMedleyPruningThreshold(results, resultLimit);
  let bestResult: BandoriMedleyTeamSearchResult | null = null;
  let observedUpperBound = Number.NEGATIVE_INFINITY;

  while (openNodes.length > 0) {
    profiling.conflictExactBnbMaxOpenNodeCount = Math.max(
      profiling.conflictExactBnbMaxOpenNodeCount,
      openNodes.length,
    );
    if (profiling.conflictExactBnbNodeCount >= nodeLimit) {
      profiling.conflictExactBnbAbortCount += 1;
      return {
        proved: false,
        result: bestResult,
        observedUpperBound: Number.isFinite(observedUpperBound) ? observedUpperBound : null,
      };
    }
    if (stats.timedOut || performance.now() >= deadlineAt || isPastDeadline()) {
      stats.isExhaustive = false;
      stats.timedOut = true;
      stats.searchMode = "bounded";
      profiling.conflictExactBnbAbortCount += 1;
      return {
        proved: false,
        result: bestResult,
        observedUpperBound: Number.isFinite(observedUpperBound) ? observedUpperBound : null,
      };
    }

    const node = openNodes.shift();
    if (!node) {
      break;
    }
    profiling.conflictExactBnbNodeCount += 1;
    profiling.conflictExactBnbMaxDepth = Math.max(profiling.conflictExactBnbMaxDepth, node.depth);

    const bestTeams: MedleyTeamCandidate[] = [];
    let aborted = false;
    let infeasible = false;
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const solveResult = findBestMedleySlotTeamWithConstraintsAndCache(
        slotBestCache,
        slotIndex,
        slots[slotIndex],
        {
          forcedCardIds: node.forcedCardIdsBySlot[slotIndex],
          bannedCardIds: node.bannedCardIdsBySlot[slotIndex],
        },
        server,
        perfectRate,
        stats,
        profiling,
        isPastDeadline,
        deadlineAt,
        slotSolveNodeLimit,
      );
      if (solveResult.aborted) {
        aborted = true;
        break;
      }
      if (!solveResult.candidate) {
        infeasible = true;
        break;
      }
      bestTeams.push(solveResult.candidate);
    }
    if (aborted) {
      profiling.conflictExactBnbAbortCount += 1;
      return {
        proved: false,
        result: bestResult,
        observedUpperBound: Number.isFinite(observedUpperBound) ? observedUpperBound : null,
      };
    }
    if (infeasible) {
      profiling.conflictExactBnbPrunedNodeCount += 1;
      continue;
    }

    const upperBound = bestTeams.reduce((sum, team) => sum + team.result.score, 0);
    observedUpperBound = Math.max(observedUpperBound, upperBound);
    const gap = Math.max(0, upperBound - incumbentScore);
    if (upperBound > (profiling.conflictExactBnbBestUpper ?? Number.NEGATIVE_INFINITY)) {
      profiling.conflictExactBnbBestUpper = upperBound;
      profiling.conflictExactBnbBestGap = gap;
    }
    if (upperBound <= incumbentScore) {
      profiling.conflictExactBnbPrunedNodeCount += 1;
      continue;
    }

    if (medleyConflictTeamsAreDisjoint(bestTeams)) {
      const selectedBySong: Array<MedleyTeamCandidate | undefined> = [];
      bestTeams.forEach((team, slotIndex) => {
        selectedBySong[slots[slotIndex].songIndex] = team;
      });
      const result = buildMedleyResult(slots, selectedBySong, configuration);
      if (result) {
        observeEvaluatedResult?.(result);
        bestResult = compareMedleyResultLike(bestResult, result);
        if (result.score > incumbentScore) {
          incumbentScore = result.score;
        }
      }
      profiling.conflictExactBnbSolvedNodeCount += 1;
      continue;
    }

    const conflictCardId = getMedleyConflictCardId(slots, bestTeams);
    if (conflictCardId === null) {
      profiling.conflictExactBnbPrunedNodeCount += 1;
      continue;
    }

    const children = buildMedleyConflictChildNodes(node, bestTeams, conflictCardId);
    openNodes.unshift(...children);
  }

  profiling.conflictExactBnbCompletedCount += 1;
  return { proved: true, result: bestResult, observedUpperBound: null };
}
