/*
 * Area-item configuration ordering and coarse filtering for medley search.
 *
 * Ordering is heuristic and affects speed only. Coarse restrictions can reduce the searched
 * configuration set, so search.ts must reflect that in the final proof status.
 */

import {
  MEDLEY_BAND_ID_BY_AREA_ITEM_KEY,
  MEDLEY_PARAMETER_KEYS,
  MEDLEY_TEAM_COUNT,
  MEDLEY_TEAM_SIZE,
} from "./constants";
import { calculateBandoriCardEventBonus } from "@/lib/bandori-team-calculator";
import { getRegionalLevelNumber } from "@/lib/bandori/team-builder/core/utils";
import type { BandoriMedleyTeamSearchInput, BandoriMedleyTeamSearchResult, MedleySlotSearch } from "./types";
import type { CalculatedBandoriCard } from "@/lib/bandori-team-calculator";
import type { BandoriAreaItemConfiguration } from "@/lib/bandori/team-builder/core";

export function getMedleyPruningThreshold(results: BandoriMedleyTeamSearchResult[], resultLimit: number): number {
  return results.length >= resultLimit ? results[resultLimit - 1]?.score ?? Number.NEGATIVE_INFINITY : Number.NEGATIVE_INFINITY;
}

export function getMedleySlotCandidateLimits(slots: MedleySlotSearch[], candidateCardCount: number): number[] {
  const rankedSlotIndices = slots
    .map((_, index) => index)
    .sort((left, right) => (
      slots[right].rootScoreUpperBound - slots[left].rootScoreUpperBound
      || slots[right].baseScoreRatePerPower - slots[left].baseScoreRatePerPower
      || right - left
    ));
  const limitsByRank = candidateCardCount <= 200
    ? [120, 80, 50]
    : [32, 20, 12];
  const limits = new Array<number>(slots.length).fill(limitsByRank[limitsByRank.length - 1]);
  rankedSlotIndices.forEach((slotIndex, rank) => {
    limits[slotIndex] = limitsByRank[Math.min(rank, limitsByRank.length - 1)];
  });
  return limits;
}

export function getMedleyAreaItemCoarseKey(configuration: BandoriAreaItemConfiguration): string {
  return `${configuration.bandKey ?? "none"}:${configuration.attribute ?? "none"}`;
}

export function toMedleyFiniteNumber(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function getMedleyRegionalNumber(value: unknown, server: number): number {
  if (Array.isArray(value)) {
    return toMedleyFiniteNumber(value[server]) ?? toMedleyFiniteNumber(value[0]) ?? 0;
  }
  return toMedleyFiniteNumber(value) ?? 0;
}

export function getMedleyCardEventParameterPower(
  input: Pick<BandoriMedleyTeamSearchInput, "eventBonus">,
  card: CalculatedBandoriCard,
): number {
  const eventBonus = calculateBandoriCardEventBonus(card, input.eventBonus);
  return MEDLEY_PARAMETER_KEYS.reduce((sum, _, index) => sum + eventBonus.parameterBonus[index], 0);
}

export function estimateMedleyConfigurationCardPower(
  input: BandoriMedleyTeamSearchInput,
  card: CalculatedBandoriCard,
  configuration: BandoriAreaItemConfiguration,
  server: number,
  userAreaItemsById: Map<number, { level: number }>,
): number {
  const eventPower = getMedleyCardEventParameterPower(input, card);
  return configuration.selectedAreaItemIds.reduce((power, areaItemId) => {
    const areaItem = input.areaItemsById[String(areaItemId)];
    const level = userAreaItemsById.get(areaItemId)?.level ?? 0;
    if (!areaItem || level <= 0) {
      return power;
    }

    const targetAttributes = Array.isArray(areaItem.targetAttributes) ? areaItem.targetAttributes : [];
    const targetBandIds = Array.isArray(areaItem.targetBandIds)
      ? areaItem.targetBandIds.map((item) => Math.trunc(toMedleyFiniteNumber(item) ?? Number.NaN))
      : [];
    if (!targetAttributes.includes(card.attribute) || card.bandId === null || !targetBandIds.includes(card.bandId)) {
      return power;
    }

    return power + MEDLEY_PARAMETER_KEYS.reduce((sum, key, index) => {
      const rate = getRegionalLevelNumber(areaItem[key], level, server) / 100;
      return sum + card.characterParam[index] * rate;
    }, 0);
  }, card.totalPower + eventPower);
}

export function estimateMedleyLockedConfigurationPotential(
  input: BandoriMedleyTeamSearchInput,
  calculatedCards: CalculatedBandoriCard[],
  configuration: BandoriAreaItemConfiguration,
  server: number,
): number {
  const selectedByCharacterCount = new Map<number, number>();
  const userAreaItemsById = new Map(input.userAreaItems.map((areaItem) => [areaItem.areaItemId, areaItem]));
  let selectedCount = 0;
  let potential = 0;
  const rankedCards = [...calculatedCards]
    .map((card) => ({
      card,
      power: estimateMedleyConfigurationCardPower(input, card, configuration, server, userAreaItemsById),
    }))
    .sort((left, right) => right.power - left.power || left.card.cardId - right.card.cardId);

  for (const { card, power } of rankedCards) {
    const usedCount = selectedByCharacterCount.get(card.characterId) ?? 0;
    if (usedCount >= MEDLEY_TEAM_COUNT) {
      continue;
    }
    selectedByCharacterCount.set(card.characterId, usedCount + 1);
    potential += power;
    selectedCount += 1;
    if (selectedCount >= MEDLEY_TEAM_COUNT * MEDLEY_TEAM_SIZE) {
      break;
    }
  }

  return potential;
}

export function medleyConfigurationMatchesCoarseFilter(
  configuration: BandoriAreaItemConfiguration,
  filter: NonNullable<BandoriMedleyTeamSearchInput["coarseAreaItemFilter"]>,
): boolean {
  if (filter.bandKey !== undefined && configuration.bandKey !== filter.bandKey) {
    return false;
  }
  if (filter.attribute !== undefined && configuration.attribute !== filter.attribute) {
    return false;
  }
  if (filter.parameter !== undefined && configuration.parameter !== filter.parameter) {
    return false;
  }
  return true;
}

export function filterMedleyConfigurationsByCoarseKeys(
  configurations: BandoriAreaItemConfiguration[],
  coarseKeys: Set<string>,
): BandoriAreaItemConfiguration[] {
  if (coarseKeys.size === 0) {
    return configurations;
  }
  return configurations.filter((configuration) => coarseKeys.has(getMedleyAreaItemCoarseKey(configuration)));
}

export function getMedleyCoarseRepresentativeConfigurationIndices(
  configurations: BandoriAreaItemConfiguration[],
): number[] {
  const representativeByKey = new Map<string, number>();
  configurations.forEach((configuration, index) => {
    const key = getMedleyAreaItemCoarseKey(configuration);
    const currentIndex = representativeByKey.get(key);
    if (currentIndex === undefined || configurations[currentIndex]?.parameter !== null && configuration.parameter === null) {
      representativeByKey.set(key, index);
    }
  });
  return [...representativeByKey.values()];
}

export function estimateMedleyStaticCoarsePotential(
  input: BandoriMedleyTeamSearchInput,
  calculatedCards: CalculatedBandoriCard[],
  configuration: BandoriAreaItemConfiguration,
): number {
  const bandId = configuration.bandKey ? MEDLEY_BAND_ID_BY_AREA_ITEM_KEY[configuration.bandKey] : null;
  const scoredCards = calculatedCards
    .map((card) => {
      const bandMultiplier = bandId === null || bandId === undefined
        ? 1
        : card.bandId === bandId
          ? 1.28
          : 1;
      const attributeMultiplier = configuration.attribute && card.attribute === configuration.attribute ? 1.12 : 1;
      const eventPower = getMedleyCardEventParameterPower(input, card);
      return {
        card,
        score: card.totalPower * bandMultiplier * attributeMultiplier + eventPower,
      };
    })
    .sort((left, right) => right.score - left.score);
  const selectedCharacterCounts = new Map<number, number>();
  let score = 0;
  let selectedCount = 0;
  for (const entry of scoredCards) {
    const selectedCharacterCount = selectedCharacterCounts.get(entry.card.characterId) ?? 0;
    if (selectedCharacterCount >= MEDLEY_TEAM_COUNT) {
      continue;
    }
    selectedCharacterCounts.set(entry.card.characterId, selectedCharacterCount + 1);
    score += entry.score;
    selectedCount += 1;
    if (selectedCount >= MEDLEY_TEAM_COUNT * MEDLEY_TEAM_SIZE) {
      break;
    }
  }
  return selectedCount >= MEDLEY_TEAM_COUNT * MEDLEY_TEAM_SIZE ? score : Number.NEGATIVE_INFINITY;
}

export function orderMedleyCoarseSeedConfigurationIndices(
  configurations: BandoriAreaItemConfiguration[],
  calculatedCards: CalculatedBandoriCard[],
  input: BandoriMedleyTeamSearchInput,
): number[] {
  // This ordering is deliberately cheap and static. It only chooses which shared item configs
  // receive early seed time; exactness still depends on the later DFS coverage.
  const originalIndices = getMedleyCoarseRepresentativeConfigurationIndices(configurations);
  const staticRankedIndices = [...originalIndices]
    .sort((left, right) => (
      estimateMedleyStaticCoarsePotential(input, calculatedCards, configurations[right])
      - estimateMedleyStaticCoarsePotential(input, calculatedCards, configurations[left])
      || left - right
    ));
  const orderedIndices: number[] = [];
  const pushIndex = (index: number): void => {
    if (!orderedIndices.includes(index)) {
      orderedIndices.push(index);
    }
  };
  staticRankedIndices.slice(0, 3).forEach(pushIndex);
  originalIndices.forEach(pushIndex);
  staticRankedIndices.forEach(pushIndex);
  return orderedIndices;
}
