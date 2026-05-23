/*
 * Single-search seed team helpers.
 *
 * Seed teams only raise the incumbent threshold before exact DFS. They never decide
 * correctness; every seed is evaluated through the same exact team-evaluation path.
 */
import { ATTRIBUTE_KEYS } from "../core/constants";
import type { BandoriCardAttribute } from "@/lib/bandori-team-calculator";
import type { BandoriTeamSearchEventMode, BandoriTeamSearchTarget, SearchCard, SearchObjectiveAdapter } from "../core/types";

function addSearchCardToGroup<K>(groups: Map<K, SearchCard[]>, key: K, card: SearchCard): void {
  const group = groups.get(key);
  if (group) {
    group.push(card);
  } else {
    groups.set(key, [card]);
  }
}

function pickFirstDistinctCharacterCards(cards: SearchCard[]): SearchCard[] | null {
  const selectedCards: SearchCard[] = [];
  const usedCharacters = new Set<number>();
  for (const card of cards) {
    if (usedCharacters.has(card.characterId)) {
      continue;
    }
    selectedCards.push(card);
    usedCharacters.add(card.characterId);
    if (selectedCards.length === 5) {
      return selectedCards;
    }
  }
  return null;
}

function getSeedTeamSortValue(
  cards: SearchCard[],
  target: BandoriTeamSearchTarget,
  eventMode: BandoriTeamSearchEventMode,
): number {
  const scoreProxy = cards.reduce((sum, card) => (
    sum + card.effectivePower * (1 + card.skillAverageRate + card.skillLeaderRate)
  ), 0);
  if (target === "eventPoint" && eventMode === "pointBonus") {
    return scoreProxy * (1 + cards.reduce((sum, card) => sum + Math.max(0, card.pointBonusRate), 0));
  }
  return scoreProxy;
}

export function buildSeedTeams(
  cards: SearchCard[],
  target: BandoriTeamSearchTarget,
  eventMode: BandoriTeamSearchEventMode,
  objective?: SearchObjectiveAdapter,
): SearchCard[][] {
  // Seed teams only fill top-N quickly and raise pruning thresholds. They are fully evaluated and do not decide the final answer directly.
  const maxSeedTeams = objective?.maxSeedTeams ?? (target === "eventPoint" && eventMode === "pointBonus" ? 32 : 12);
  const orderings = [
    cards,
    [...cards].sort((left, right) => (
      (right.effectivePower * (1 + right.skillUpperRate)) - (left.effectivePower * (1 + left.skillUpperRate))
      || left.supportPower - right.supportPower
      || right.effectivePower - left.effectivePower
      || left.cardId - right.cardId
    )),
    [...cards].sort((left, right) => (
      right.skillUpperRate - left.skillUpperRate
      || left.supportPower - right.supportPower
      || right.effectivePower - left.effectivePower
      || left.cardId - right.cardId
    )),
  ];
  if (target === "eventPoint" && eventMode === "pointBonus") {
    orderings.push(
      [...cards].sort((left, right) => (
        right.pointBonusRate - left.pointBonusRate
        || (right.effectivePower * (1 + right.skillUpperRate)) - (left.effectivePower * (1 + left.skillUpperRate))
        || left.supportPower - right.supportPower
        || left.cardId - right.cardId
      )),
      [...cards].sort((left, right) => (
        (right.effectivePower * (1 + right.skillAverageRate + right.skillLeaderRate) * (1 + Math.max(0, right.pointBonusRate)))
        - (left.effectivePower * (1 + left.skillAverageRate + left.skillLeaderRate) * (1 + Math.max(0, left.pointBonusRate)))
        || right.pointBonusRate - left.pointBonusRate
        || left.supportPower - right.supportPower
        || left.cardId - right.cardId
      )),
    );
    if (objective?.usesMissionSupport) {
      orderings.push(
        [...cards].sort((left, right) => (
          left.supportPower - right.supportPower
          || right.pointBonusRate - left.pointBonusRate
          || (right.effectivePower * (1 + right.skillUpperRate)) - (left.effectivePower * (1 + left.skillUpperRate))
          || left.cardId - right.cardId
        )),
      );
    }
  }
  const seen = new Set<string>();
  const teams: SearchCard[][] = [];

  const addSeedTeam = (team: SearchCard[] | null): void => {
    if (!team) {
      return;
    }
    const key = team.map((card) => card.cardId).sort((left, right) => left - right).join(",");
    if (!seen.has(key)) {
      seen.add(key);
      teams.push(team);
    }
  };

  for (const ordering of orderings) {
    addSeedTeam(pickFirstDistinctCharacterCards(ordering));
  }

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

  const bandIds = [...bandCardsById.keys()];
  for (const bandId of bandIds) {
    addSeedTeam(pickFirstDistinctCharacterCards(bandCardsById.get(bandId) ?? []));
  }

  for (const attribute of ATTRIBUTE_KEYS) {
    addSeedTeam(pickFirstDistinctCharacterCards(attributeCardsByAttribute.get(attribute) ?? []));
  }

  for (const bandId of bandIds) {
    for (const attribute of ATTRIBUTE_KEYS) {
      addSeedTeam(pickFirstDistinctCharacterCards(bothCardsByKey.get(`${bandId}:${attribute}`) ?? []));
    }
  }

  return teams
    .sort((left, right) => (
      (objective?.getSeedTeamSortValue(right) ?? getSeedTeamSortValue(right, target, eventMode))
      - (objective?.getSeedTeamSortValue(left) ?? getSeedTeamSortValue(left, target, eventMode))
    ))
    .slice(0, maxSeedTeams);
}
