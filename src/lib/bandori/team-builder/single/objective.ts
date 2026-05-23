/*
 * Single-search objective policy.
 *
 * Core modules provide score and event-point math; this module decides how the single-song
 * search orders cards, compares dominance, and converts optimistic score bounds into target
 * bounds for the selected objective.
 */
import { estimateTargetUpperBoundFromScore } from "../core/events";
import type { BandoriTeamSearchEventMode, BandoriTeamSearchInput, BandoriTeamSearchTarget, SearchCard, SearchObjectiveAdapter, SearchObjectiveMode, SupportBandContext } from "../core/types";

function getCardScorePotential(card: SearchCard, baseScoreRatePerPower: number): number {
  return card.effectivePower * (baseScoreRatePerPower + card.skillAverageRate + card.skillLeaderRate);
}

function getTeamScorePotential(cards: SearchCard[]): number {
  return cards.reduce((sum, card) => (
    sum + card.effectivePower * (1 + card.skillAverageRate + card.skillLeaderRate)
  ), 0);
}

export function createSearchObjectiveAdapter(
  input: BandoriTeamSearchInput,
  target: BandoriTeamSearchTarget,
  eventMode: BandoriTeamSearchEventMode,
  supportBandContext: SupportBandContext,
): SearchObjectiveAdapter {
  // The objective adapter centralizes target-specific dominance and upper-bound conversions.
  // Score, event-PT, and mission support use different values but share the same search machinery.
  const usesPointBonus = target === "eventPoint" && eventMode === "pointBonus";
  const usesMissionSupport = usesPointBonus && supportBandContext.enabled;
  const mode: SearchObjectiveMode = usesMissionSupport
    ? "mission-event-point"
    : usesPointBonus
      ? "event-point"
      : "score";

  return {
    mode,
    target,
    eventMode,
    usesPointBonus,
    usesMissionSupport,
    supportBandPointUpperBound: usesMissionSupport ? supportBandContext.supportBandPointUpperBound : 0,
    maxSeedTeams: usesPointBonus ? 32 : 12,
    compressionDominates: (left, right) => {
      if (left.effectivePower < right.effectivePower) {
        return false;
      }
      if (!usesPointBonus) {
        return true;
      }
      if (left.pointBonusRate < right.pointBonusRate) {
        return false;
      }
      return !usesMissionSupport || left.supportPower <= right.supportPower;
    },
    getTraversalValue: (card, baseScoreRatePerPower) => {
      const scorePotential = getCardScorePotential(card, baseScoreRatePerPower);
      if (!usesPointBonus) {
        return scorePotential;
      }
      const pointPotential = scorePotential * (1 + Math.max(0, card.pointBonusRate))
        + Math.max(0, card.pointBonusRate) * 1_000_000;
      return usesMissionSupport ? pointPotential - card.supportPower * 0.25 : pointPotential;
    },
    getSeedTeamSortValue: (cards) => {
      const scoreProxy = getTeamScorePotential(cards);
      if (!usesPointBonus) {
        return scoreProxy;
      }
      const pointBonusRate = cards.reduce((sum, card) => sum + Math.max(0, card.pointBonusRate), 0);
      const supportOpportunityCost = usesMissionSupport
        ? cards.reduce((sum, card) => sum + Math.max(0, card.supportPower), 0) / 3000
        : 0;
      return scoreProxy * (1 + pointBonusRate) - supportOpportunityCost * 1_000_000;
    },
    estimateTargetUpperBound: (scoreUpperBound, pointBonusRateUpper, boundInput, scoreRateUpper) => estimateTargetUpperBoundFromScore(
      scoreUpperBound,
      pointBonusRateUpper,
      boundInput,
      target,
      eventMode,
      usesMissionSupport ? supportBandContext.supportBandPointUpperBound : 0,
      scoreRateUpper,
    ),
  };
}
