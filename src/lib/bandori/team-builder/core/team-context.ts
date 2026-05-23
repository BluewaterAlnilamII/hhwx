/*
 * Pure team-context helpers shared by bounds and seed generation.
 *
 * These helpers know only about selected cards, character uniqueness, and same-band /
 * same-attribute context. Keeping them here avoids lower-level bound code depending on
 * higher-level seed heuristics.
 */
import type { BandoriCardAttribute } from "@/lib/bandori-team-calculator";
import type { CharacterUpperBoundIndex, SearchCard } from "./types";

export function getPossibleSameBandIds(
  cards: SearchCard[],
  upperBoundIndex: CharacterUpperBoundIndex,
): number[] {
  if (cards.length === 0) {
    return upperBoundIndex.bandIds;
  }

  const bandIds = new Set<number | null>();
  for (const card of cards) {
    bandIds.add(card.bandId);
  }
  if (bandIds.size !== 1) {
    return [];
  }

  const bandId = cards[0]?.bandId ?? null;
  return bandId === null ? [] : [bandId];
}

export function canKeepSameAttributeContext(cards: SearchCard[]): boolean {
  if (cards.length < 2) {
    return true;
  }

  const attributes = new Set<BandoriCardAttribute>();
  for (const card of cards) {
    attributes.add(card.attribute);
  }
  return attributes.size === 1;
}

export function getSearchTeamContext(cards: SearchCard[]): {
  sameBandId: number | null;
  sameAttribute: BandoriCardAttribute | null;
} {
  if (cards.length === 0) {
    return {
      sameBandId: null,
      sameAttribute: null,
    };
  }

  const firstBandId = cards[0]?.bandId ?? null;
  const firstAttribute = cards[0]?.attribute ?? null;
  const sameBandId = firstBandId !== null && cards.every((card) => card.bandId === firstBandId)
    ? firstBandId
    : null;
  const sameAttribute = firstAttribute !== null && cards.every((card) => card.attribute === firstAttribute)
    ? firstAttribute
    : null;
  return {
    sameBandId,
    sameAttribute,
  };
}

export function hasAtLeastDistinctCharacters(cards: SearchCard[], count: number): boolean {
  const characterIds = new Set<number>();
  for (const card of cards) {
    characterIds.add(card.characterId);
    if (characterIds.size >= count) {
      return true;
    }
  }
  return false;
}
