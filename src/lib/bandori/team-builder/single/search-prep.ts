/*
 * Single-search preparation helpers.
 *
 * These helpers are heuristics or caches owned by the single-song orchestration layer. They
 * improve traversal order and hot-path cost, but correctness still depends on exact DFS plus
 * optimistic upper-bound pruning.
 */
import { calculateBandoriCardEventBonus, type CalculatedBandoriCard } from "@/lib/bandori-team-calculator";
import { insertTopValue } from "../core/character-bounds";
import {
  buildSkillSearchSignature,
  getAreaItemBonusForCard,
  getAreaItemConfigurationKey,
  getCachedSearchCardSkillRateProfile,
  toAreaItemStateMap,
} from "../core/cards";
import { compareCardInstanceKey, getCardInstanceKey } from "../core/card-identity";
import { PARAMETER_KEYS } from "../core/constants";
import { resolveBandoriTeamSearchEventMode } from "../core/events";
import type {
  BandoriAreaItemConfiguration,
  BandoriTeamSearchEventMode,
  BandoriTeamSearchInput,
  PreparedChart,
  SearchCard,
  SearchCardStaticProfile,
  SearchObjectiveAdapter,
  SearchPrecomputedData,
  SupportBandContext,
} from "../core/types";

export function buildSearchPrecomputedData(
  cards: CalculatedBandoriCard[],
  input: BandoriTeamSearchInput,
  configurations: BandoriAreaItemConfiguration[],
  chart: PreparedChart,
  server: number,
  supportBandContext?: SupportBandContext,
): SearchPrecomputedData {
  // Precompute fields that do not change across area-item configurations: event bonuses,
  // support opportunity cost, skill signatures, and skill bounds.
  // Store area-item power per configuration as Float64Array so buildSearchCards does not repeatedly traverse masters.
  const eventMode = resolveBandoriTeamSearchEventMode(input.eventType, input.liveType);
  const cardStaticProfilesByKey = new Map<string, SearchCardStaticProfile>();
  for (const card of cards) {
    const eventBonus = calculateBandoriCardEventBonus(card, input.eventBonus);
    const eventPower = eventMode === "parameterPower"
      ? input.useSpecialRoomBonus
        ? PARAMETER_KEYS.reduce((sum, _, index) => sum + eventBonus.parameterBonusWithRoom[index], 0)
        : PARAMETER_KEYS.reduce((sum, _, index) => sum + eventBonus.parameterBonus[index], 0)
      : 0;
    const cardKey = getCardInstanceKey(card);
    cardStaticProfilesByKey.set(cardKey, {
      ...getCachedSearchCardSkillRateProfile(card, input, chart, server),
      skillSignature: buildSkillSearchSignature(card.skillId, input.skillsById[String(card.skillId)], card.skillLevel, server),
      pointBonusRate: eventBonus.pointBonusRate,
      supportPower: supportBandContext?.supportPowerByCardKey.get(cardKey) ?? 0,
      eventPower,
    });
  }

  const userAreaItemsById = toAreaItemStateMap(input.userAreaItems);
  const areaItemPowerByConfigurationKey = new Map<string, Float64Array>();
  for (const configuration of configurations) {
    const key = getAreaItemConfigurationKey(configuration);
    if (areaItemPowerByConfigurationKey.has(key)) {
      continue;
    }
    areaItemPowerByConfigurationKey.set(
      key,
      Float64Array.from(cards.map((card) => getAreaItemBonusForCard(
        card,
        input.areaItemsById,
        userAreaItemsById,
        configuration.selectedAreaItemIds,
        server,
      ))),
    );
  }

  return {
    cardStaticProfilesByKey,
    areaItemPowerByConfigurationKey,
  };
}

function estimateAreaItemConfigurationPowerUpper(
  configuration: BandoriAreaItemConfiguration,
  cards: CalculatedBandoriCard[],
  input: BandoriTeamSearchInput,
  server: number,
  eventMode: BandoriTeamSearchEventMode,
  precomputed?: SearchPrecomputedData,
): number {
  // Use the top 5 per-character powers under this configuration as a heuristic upper bound for configuration ordering.
  const userAreaItemsById = toAreaItemStateMap(input.userAreaItems);
  const configurationKey = getAreaItemConfigurationKey(configuration);
  const areaItemPowers = precomputed?.areaItemPowerByConfigurationKey.get(configurationKey);
  const topPowerByCharacterId = new Map<number, number>();

  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    const itemPower = areaItemPowers?.[index] ?? getAreaItemBonusForCard(
      card,
      input.areaItemsById,
      userAreaItemsById,
      configuration.selectedAreaItemIds,
      server,
    );
    const staticProfile = precomputed?.cardStaticProfilesByKey.get(getCardInstanceKey(card));
    const eventBonus = staticProfile ? null : calculateBandoriCardEventBonus(card, input.eventBonus);
    const eventPower = eventMode === "parameterPower"
      ? staticProfile?.eventPower ?? (
        input.useSpecialRoomBonus
          ? PARAMETER_KEYS.reduce((sum, _, bonusIndex) => sum + (eventBonus?.parameterBonusWithRoom[bonusIndex] ?? 0), 0)
          : PARAMETER_KEYS.reduce((sum, _, bonusIndex) => sum + (eventBonus?.parameterBonus[bonusIndex] ?? 0), 0)
      )
      : 0;
    const power = card.totalPower + itemPower + eventPower;
    const currentPower = topPowerByCharacterId.get(card.characterId) ?? Number.NEGATIVE_INFINITY;
    if (power > currentPower) {
      topPowerByCharacterId.set(card.characterId, power);
    }
  }

  const topPowers = [0, 0, 0, 0, 0];
  for (const power of topPowerByCharacterId.values()) {
    insertTopValue(topPowers, power);
  }
  return topPowers.reduce((sum, power) => sum + power, 0);
}

export function sortAreaItemConfigurationsForSearch(
  configurations: BandoriAreaItemConfiguration[],
  cards: CalculatedBandoriCard[],
  input: BandoriTeamSearchInput,
  server: number,
  eventMode: BandoriTeamSearchEventMode,
  precomputed?: SearchPrecomputedData,
): BandoriAreaItemConfiguration[] {
  // This is only a traversal heuristic. It raises the top-N threshold early, but correctness
  // still depends on later optimistic upper-bound checks, not on this order.
  return configurations
    .map((configuration, index) => ({
      configuration,
      index,
      powerUpper: estimateAreaItemConfigurationPowerUpper(configuration, cards, input, server, eventMode, precomputed),
    }))
    .sort((left, right) => (
      right.powerUpper - left.powerUpper
      || left.index - right.index
    ))
    .map((entry) => entry.configuration);
}

function compareSearchCardsForCompression(left: SearchCard, right: SearchCard): number {
  return (
    right.effectivePower - left.effectivePower
    || right.pointBonusRate - left.pointBonusRate
    || left.supportPower - right.supportPower
    || right.totalPower - left.totalPower
    || compareCardInstanceKey(left, right)
  );
}

export function compressSearchCards(
  cards: SearchCard[],
  objective: SearchObjectiveAdapter,
): { cards: SearchCard[]; prunedCount: number } {
  // Cards can be compressed only within the same character, attribute, band, and skill signature; PT mode keeps a power/bonus/support skyline.
  if (objective.usesPointBonus) {
    const skylineCards = new Map<string, SearchCard[]>();
    let prunedCount = 0;
    for (const card of cards) {
      const key = [
        card.characterId,
        card.bandId ?? "none",
        card.attribute,
        card.skillSearchSignature,
      ].join(":");
      const current = skylineCards.get(key) ?? [];
      if (current.some((item) => objective.compressionDominates(item, card))) {
        prunedCount += 1;
        continue;
      }
      const nextCurrent = current.filter((item) => !objective.compressionDominates(card, item));
      prunedCount += current.length - nextCurrent.length;
      skylineCards.set(key, [
        ...nextCurrent,
        card,
      ]);
    }

    return {
      cards: [...skylineCards.values()].flat().sort(compareSearchCardsForCompression),
      prunedCount,
    };
  }

  const bestCards = new Map<string, SearchCard>();
  let prunedCount = 0;
  cards.forEach((card) => {
    const key = [
      card.characterId,
      card.bandId ?? "none",
      card.attribute,
      card.skillSearchSignature,
    ].join(":");
    const current = bestCards.get(key);
    if (!current || card.effectivePower > current.effectivePower || (
      card.effectivePower === current.effectivePower && compareCardInstanceKey(card, current) > 0
    )) {
      if (current) {
        prunedCount += 1;
      }
      bestCards.set(key, card);
    } else {
      prunedCount += 1;
    }
  });

  return {
    cards: [...bestCards.values()].sort(compareSearchCardsForCompression),
    prunedCount,
  };
}
