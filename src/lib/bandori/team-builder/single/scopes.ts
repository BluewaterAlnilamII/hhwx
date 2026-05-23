/*
 * Single-search scope partitioning helpers.
 *
 * These helpers split one song's card pool by team context so conditional-skill upper
 * bounds stay tight without duplicating completed teams across overlapping scopes.
 */
import { ATTRIBUTE_KEYS } from "../core/constants";
import { getSearchTeamContext, hasAtLeastDistinctCharacters } from "../core/team-context";
import type { BandoriCardAttribute } from "@/lib/bandori-team-calculator";
import type { SearchCard, SearchScope, SkillContextUpperMode } from "../core/types";

export function scopeOwnsCompleteTeam(cards: SearchCard[], mode?: SkillContextUpperMode): boolean {
  // Context partitions overlap. A complete team is evaluated only by the scope matching its true context to avoid duplicates.
  if (!mode || mode === "optimistic") {
    return true;
  }

  const context = getSearchTeamContext(cards);
  if (mode === "both") {
    return context.sameBandId !== null && context.sameAttribute !== null;
  }
  if (mode === "same-band") {
    return context.sameBandId !== null && context.sameAttribute === null;
  }
  if (mode === "same-attribute") {
    return context.sameBandId === null && context.sameAttribute !== null;
  }
  return context.sameBandId === null && context.sameAttribute === null;
}

function addSearchCardToGroup<K>(groups: Map<K, SearchCard[]>, key: K, card: SearchCard): void {
  const group = groups.get(key);
  if (group) {
    group.push(card);
  } else {
    groups.set(key, [card]);
  }
}

export function createSearchScopes(cards: SearchCard[], useContextPartitioning: boolean): SearchScope[] {
  // For large pools or PT searches, splitting by team context gives tighter bounds for conditional skills.
  // Small pools keep one optimistic scope to avoid partition overhead.
  if (!useContextPartitioning) {
    return [{
      searchCards: cards,
    }];
  }

  const scopes: SearchScope[] = [{
    searchCards: cards,
    skillContextUpperMode: "mixed",
  }];
  const bandCardsById = new Map<number, SearchCard[]>();
  const attributeCardsByAttribute = new Map<BandoriCardAttribute, SearchCard[]>();
  const bothCardsByKey = new Map<string, SearchCard[]>();

  for (const card of cards) {
    addSearchCardToGroup(attributeCardsByAttribute, card.attribute, card);
    if (card.bandId === null) {
      continue;
    }
    addSearchCardToGroup(bandCardsById, card.bandId, card);
    addSearchCardToGroup(bothCardsByKey, `${card.bandId}:${card.attribute}`, card);
  }

  const bandIds = [...bandCardsById.keys()].sort((left, right) => left - right);

  for (const bandId of bandIds) {
    const bandCards = bandCardsById.get(bandId) ?? [];
    if (hasAtLeastDistinctCharacters(bandCards, 5)) {
      scopes.push({
        searchCards: bandCards,
        skillContextUpperMode: "same-band",
      });
    }

    for (const attribute of ATTRIBUTE_KEYS) {
      const bothCards = bothCardsByKey.get(`${bandId}:${attribute}`) ?? [];
      if (hasAtLeastDistinctCharacters(bothCards, 5)) {
        scopes.push({
          searchCards: bothCards,
          skillContextUpperMode: "both",
        });
      }
    }
  }

  for (const attribute of ATTRIBUTE_KEYS) {
    const attributeCards = attributeCardsByAttribute.get(attribute) ?? [];
    if (hasAtLeastDistinctCharacters(attributeCards, 5)) {
      scopes.push({
        searchCards: attributeCards,
        skillContextUpperMode: "same-attribute",
      });
    }
  }

  return scopes;
}
