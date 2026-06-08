/*
 * Experimental anchor and opportunity-cost upper bounds.
 *
 * These opt-in bounds try to tighten remaining-slot estimates around strong anchor cards.
 * They are isolated from the default DFS because prior benchmarks showed mostly neutral gains.
 */

import {
  MEDLEY_DEFAULT_ANCHOR_CANDIDATE_LIMIT,
  MEDLEY_DEFAULT_OPPORTUNITY_ANCHOR_LIMIT,
  MEDLEY_MAX_OPPORTUNITY_ANCHOR_LIMIT,
  MEDLEY_TEAM_COUNT,
} from "../constants";
import { getMedleyCharacterMask } from "../slots";
import {
  estimateMedleySlotBranchScoreUpperBound,
  getMedleyCardSkillAverageRateUpper,
  getMedleyCardSkillLeaderRateUpper,
} from "./skill-context";
import { getMedleyCandidateCards, getMedleyCandidateCardIds } from "../candidates";
import { clamp } from "@/lib/bandori/team-builder/core";
import type {
  BandoriMedleyTeamSearchProfilingStats,
  MedleyAnchorSlotUpperEstimate,
  MedleyOpportunityCostUpperEstimate,
  MedleySlotSearch,
  MedleyTeamCandidate,
} from "../types";
import type { SearchCard } from "@/lib/bandori/team-builder/core";

export function estimateMedleyAnchorSlotDecompositionUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  slotCandidates: MedleyTeamCandidate[][],
  slotCandidateLimits: number[],
  getRemainingUpperBound: (
    remainingSlotIndices: number[],
    bannedCards: Set<number>,
    useContextualSkillUpper?: boolean,
    useSkillAwareCapacityUpper?: boolean,
    useParetoCapacityUpper?: boolean,
    useBucketedCapacityUpper?: boolean,
  ) => number,
  useContextualSkillUpper: boolean,
  useSkillAwareCapacityUpper: boolean,
  useParetoCapacityUpper: boolean,
  useBucketedCapacityUpper: boolean,
  requestedCandidateLimit: number | null,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): MedleyAnchorSlotUpperEstimate | null {
  profiling.capacityAnchorSlotUpperCallCount += 1;
  const startedAt = performance.now();
  if (remainingSlotIndices.length !== MEDLEY_TEAM_COUNT || bannedCardIds.size > 0) {
    profiling.capacityAnchorSlotUpperAbortCount += 1;
    return null;
  }

  const candidateLimit = Math.max(
    1,
    Math.trunc(requestedCandidateLimit ?? MEDLEY_DEFAULT_ANCHOR_CANDIDATE_LIMIT),
  );
  let bestEstimate: MedleyAnchorSlotUpperEstimate | null = null;
  let totalSelectedCount = 0;
  const anchorSlotIndices = [...remainingSlotIndices].sort((left, right) => (
    slots[right].rootScoreUpperBound - slots[left].rootScoreUpperBound
    || slots[right].startCombo - slots[left].startCombo
    || right - left
  ));
  for (const anchorSlotIndex of anchorSlotIndices) {
    const candidates = slotCandidates[anchorSlotIndex] ?? [];
    const selectedCount = Math.min(candidates.length, candidateLimit);
    if (selectedCount <= 0) {
      continue;
    }

    const futureSlotIndices = remainingSlotIndices.filter((slotIndex) => slotIndex !== anchorSlotIndex);
    let upperBound = Number.NEGATIVE_INFINITY;
    for (let candidateIndex = 0; candidateIndex < selectedCount; candidateIndex += 1) {
      const candidate = candidates[candidateIndex];
      const candidateBannedCardIds = new Set(bannedCardIds);
      getMedleyCandidateCardIds(candidate).forEach((cardId) => candidateBannedCardIds.add(cardId));
      const futureUpperBound = getRemainingUpperBound(
        futureSlotIndices,
        candidateBannedCardIds,
        useContextualSkillUpper,
        useSkillAwareCapacityUpper,
        useParetoCapacityUpper,
        useBucketedCapacityUpper,
      );
      if (Number.isFinite(futureUpperBound)) {
        upperBound = Math.max(upperBound, candidate.result.score + futureUpperBound);
      }
    }

    const originalCandidateLimit = slotCandidateLimits[anchorSlotIndex] ?? candidates.length;
    const mayHaveUnenumeratedOrUnselectedAnchorTeams = selectedCount < candidates.length
      || candidates.length >= originalCandidateLimit;
    const tailUpper = mayHaveUnenumeratedOrUnselectedAnchorTeams
      ? candidates[selectedCount - 1]?.result.score ?? null
      : null;
    if (tailUpper !== null) {
      const futureUpperBoundWithoutAnchorBans = getRemainingUpperBound(
        futureSlotIndices,
        bannedCardIds,
        useContextualSkillUpper,
        useSkillAwareCapacityUpper,
        useParetoCapacityUpper,
        useBucketedCapacityUpper,
      );
      if (Number.isFinite(futureUpperBoundWithoutAnchorBans)) {
        upperBound = Math.max(upperBound, tailUpper + futureUpperBoundWithoutAnchorBans);
      }
    }

    if (!Number.isFinite(upperBound)) {
      continue;
    }

    totalSelectedCount += selectedCount;
    if (!bestEstimate || upperBound < bestEstimate.upperBound) {
      bestEstimate = {
        upperBound,
        anchorSlotIndex,
        candidateCount: selectedCount,
        tailUpper,
      };
    }
  }

  if (!bestEstimate) {
    profiling.capacityAnchorSlotUpperAbortCount += 1;
    return null;
  }

  profiling.capacityAnchorSlotUpperCompletedCount += 1;
  profiling.capacityAnchorSlotUpperCandidateCount += totalSelectedCount;
  profiling.capacityAnchorSlotUpperAnchorSlotIndex = bestEstimate.anchorSlotIndex;
  profiling.capacityAnchorSlotUpperTailUpper = bestEstimate.tailUpper;
  profiling.capacityAnchorSlotUpperElapsedMs += performance.now() - startedAt;
  return bestEstimate;
}

export function collectMedleyOpportunityAnchorCards(
  slot: MedleySlotSearch,
  slotCandidates: MedleyTeamCandidate[],
  limit: number,
): SearchCard[] {
  const scoredCardIds = new Map<number, { score: number; firstSeen: number }>();
  const cardById = new Map<number, SearchCard>();
  let firstSeen = 0;
  const addCard = (card: SearchCard, score: number): void => {
    cardById.set(card.cardId, card);
    const current = scoredCardIds.get(card.cardId);
    if (!current) {
      scoredCardIds.set(card.cardId, { score, firstSeen });
      firstSeen += 1;
    } else {
      current.score += score;
    }
  };

  for (const [candidateRank, candidate] of slotCandidates.entries()) {
    const candidateWeight = Math.max(1, slotCandidates.length - candidateRank);
    for (const card of getMedleyCandidateCards(candidate)) {
      addCard(card, candidate.result.score * candidateWeight);
    }
  }

  for (const card of slot.searchCards) {
    addCard(
      card,
      card.effectivePower * (
        slot.baseScoreRatePerPower
        + getMedleyCardSkillAverageRateUpper(card)
        + getMedleyCardSkillLeaderRateUpper(card)
      ),
    );
  }

  return [...scoredCardIds.entries()]
    .sort((left, right) => right[1].score - left[1].score || left[1].firstSeen - right[1].firstSeen || left[0] - right[0])
    .slice(0, limit)
    .map(([cardId]) => cardById.get(cardId))
    .filter((card): card is SearchCard => card !== undefined);
}

export function estimateMedleySlotUpperBoundIncludingCard(
  slot: MedleySlotSearch,
  card: SearchCard,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): number {
  const characterMask = getMedleyCharacterMask(slot, card);
  if (!characterMask) {
    return Number.NEGATIVE_INFINITY;
  }
  return estimateMedleySlotBranchScoreUpperBound(
    slot,
    [card],
    0,
    new Set<number>([card.cardId]),
    characterMask.low,
    characterMask.high,
    card.effectivePower,
    profiling,
    true,
  );
}

export function estimateMedleySlotUpperBoundExcludingCards(
  slot: MedleySlotSearch,
  excludedCardIds: Set<number>,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): number {
  return estimateMedleySlotBranchScoreUpperBound(
    slot,
    [],
    0,
    excludedCardIds,
    0,
    0,
    0,
    profiling,
    true,
  );
}

export function estimateMedleyOpportunityCostUpperBound(
  slots: MedleySlotSearch[],
  remainingSlotIndices: number[],
  bannedCardIds: Set<number>,
  slotCandidates: MedleyTeamCandidate[][],
  getRemainingUpperBound: (
    remainingSlotIndices: number[],
    bannedCards: Set<number>,
    useContextualSkillUpper?: boolean,
    useSkillAwareCapacityUpper?: boolean,
    useParetoCapacityUpper?: boolean,
    useBucketedCapacityUpper?: boolean,
  ) => number,
  useContextualSkillUpper: boolean,
  useSkillAwareCapacityUpper: boolean,
  useParetoCapacityUpper: boolean,
  useBucketedCapacityUpper: boolean,
  requestedAnchorLimit: number | null,
  profiling: BandoriMedleyTeamSearchProfilingStats,
): MedleyOpportunityCostUpperEstimate | null {
  profiling.capacityOpportunityCostUpperCallCount += 1;
  const startedAt = performance.now();
  if (remainingSlotIndices.length !== MEDLEY_TEAM_COUNT || bannedCardIds.size > 0) {
    profiling.capacityOpportunityCostUpperAbortCount += 1;
    return null;
  }

  const anchorLimit = clamp(
    Math.trunc(requestedAnchorLimit ?? MEDLEY_DEFAULT_OPPORTUNITY_ANCHOR_LIMIT),
    1,
    MEDLEY_MAX_OPPORTUNITY_ANCHOR_LIMIT,
  );
  const anchorSlotIndices = [...remainingSlotIndices].sort((left, right) => (
    slots[right].startCombo - slots[left].startCombo
    || slots[right].rootScoreUpperBound - slots[left].rootScoreUpperBound
    || right - left
  ));
  let totalAnchorCount = 0;
  let bestEstimate: MedleyOpportunityCostUpperEstimate | null = null;

  for (const anchorSlotIndex of anchorSlotIndices) {
    const slot = slots[anchorSlotIndex];
    const anchors = collectMedleyOpportunityAnchorCards(
      slot,
      slotCandidates[anchorSlotIndex] ?? [],
      anchorLimit,
    );
    if (anchors.length === 0) {
      continue;
    }

    const futureSlotIndices = remainingSlotIndices.filter((slotIndex) => slotIndex !== anchorSlotIndex);
    const excludedAnchorCardIds = new Set(bannedCardIds);
    anchors.forEach((card) => excludedAnchorCardIds.add(card.cardId));
    const tailSlotUpper = estimateMedleySlotUpperBoundExcludingCards(slot, excludedAnchorCardIds, profiling);
    let slotUpperBound = Number.NEGATIVE_INFINITY;
    if (Number.isFinite(tailSlotUpper)) {
      const tailFutureUpper = getRemainingUpperBound(
        futureSlotIndices,
        bannedCardIds,
        useContextualSkillUpper,
        useSkillAwareCapacityUpper,
        useParetoCapacityUpper,
        useBucketedCapacityUpper,
      );
      if (!Number.isFinite(tailFutureUpper)) {
        profiling.capacityOpportunityCostUpperAbortCount += 1;
        return null;
      }
      slotUpperBound = Math.max(slotUpperBound, tailSlotUpper + tailFutureUpper);
    }

    for (const anchor of anchors) {
      const forcedSlotUpper = estimateMedleySlotUpperBoundIncludingCard(slot, anchor, profiling);
      if (!Number.isFinite(forcedSlotUpper)) {
        continue;
      }
      const anchorBannedCardIds = new Set(bannedCardIds);
      anchorBannedCardIds.add(anchor.cardId);
      const futureUpper = getRemainingUpperBound(
        futureSlotIndices,
        anchorBannedCardIds,
        useContextualSkillUpper,
        useSkillAwareCapacityUpper,
        useParetoCapacityUpper,
        useBucketedCapacityUpper,
      );
      if (!Number.isFinite(futureUpper)) {
        continue;
      }
      slotUpperBound = Math.max(slotUpperBound, forcedSlotUpper + futureUpper);
    }

    if (!Number.isFinite(slotUpperBound)) {
      continue;
    }
    totalAnchorCount += anchors.length;
    if (!bestEstimate || slotUpperBound < bestEstimate.upperBound) {
      bestEstimate = {
        upperBound: slotUpperBound,
        anchorSlotIndex,
        anchorCount: anchors.length,
        tailUpper: Number.isFinite(tailSlotUpper) ? tailSlotUpper : null,
      };
    }
  }

  profiling.capacityOpportunityCostUpperElapsedMs += performance.now() - startedAt;
  if (!bestEstimate) {
    profiling.capacityOpportunityCostUpperAbortCount += 1;
    return null;
  }
  profiling.capacityOpportunityCostUpperCompletedCount += 1;
  profiling.capacityOpportunityCostUpperAnchorCount += totalAnchorCount;
  profiling.capacityOpportunityCostUpperTailUpper = bestEstimate.tailUpper;
  return bestEstimate;
}
