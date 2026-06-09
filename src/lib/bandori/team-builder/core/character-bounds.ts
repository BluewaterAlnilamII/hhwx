/*
 * Character-aware upper bounds shared by single and medley search.
 *
 * The bounds are intentionally optimistic: they may overestimate what remains, but must never
 * underestimate it. That invariant is what makes branch pruning behavior-preserving.
 */
import { estimateTargetUpperBoundFromScore } from "./events";
import { clamp } from "./utils";
import { canKeepSameAttributeContext, getPossibleSameBandIds, hasAtLeastDistinctCharacters } from "./team-context";
import type { BandoriTeamSearchEventMode, BandoriTeamSearchInput, BandoriTeamSearchResult, BandoriTeamSearchTarget, CharacterUpperBoundIndex, SearchCard, SearchObjectiveAdapter, SkillContextUpperMode } from "./types";
export function buildCharacterUpperBoundIndex(
  cards: SearchCard[],
  skillContextUpperMode?: SkillContextUpperMode,
  includeLeaderScoreUpBounds = false,
): CharacterUpperBoundIndex {
  // Build suffix upper-bound indexes in traversal order. Each startIndex answers:
  // "From here onward, what is the best power / point bonus / skill rate each character can still provide?"
  const characterIdSet = new Set<number>();
  const firstBandIdByCharacterId = new Map<number, number | null>();
  for (const card of cards) {
    characterIdSet.add(card.characterId);
    if (!firstBandIdByCharacterId.has(card.characterId)) {
      firstBandIdByCharacterId.set(card.characterId, card.bandId);
    }
  }
  const characterIds = [...characterIdSet].sort((left, right) => left - right);
  const characterIndexById = new Map(characterIds.map((characterId, index) => [characterId, index]));
  const bandIdSet = new Set<number>();
  const characterBandIds = characterIds.map((characterId) => {
    const bandId = firstBandIdByCharacterId.get(characterId) ?? null;
    if (bandId !== null) {
      bandIdSet.add(bandId);
    }
    return bandId;
  });
  const bandIds = [...bandIdSet].sort((left, right) => left - right);
  const shouldBuildAllSkillModes = skillContextUpperMode === undefined || skillContextUpperMode === "optimistic";
  const shouldBuildDefaultSkillMode = shouldBuildAllSkillModes;
  const shouldBuildSameBandSkillMode = shouldBuildAllSkillModes || skillContextUpperMode === "same-band";
  const shouldBuildSameAttributeSkillMode = shouldBuildAllSkillModes || skillContextUpperMode === "same-attribute";
  const shouldBuildBothSkillMode = shouldBuildAllSkillModes || skillContextUpperMode === "both";
  const shouldBuildMixedSkillMode = shouldBuildAllSkillModes || skillContextUpperMode === "mixed";
  const emptySkillRates = new Float64Array(characterIds.length);
  let power = new Float64Array(characterIds.length);
  let pointBonusRate = new Float64Array(characterIds.length);
  let skillAverageRate = new Float64Array(characterIds.length);
  let skillLeaderRate = new Float64Array(characterIds.length);
  let skillSameBandAverageRate = new Float64Array(characterIds.length);
  let skillSameBandLeaderRate = new Float64Array(characterIds.length);
  let skillSameAttributeAverageRate = new Float64Array(characterIds.length);
  let skillSameAttributeLeaderRate = new Float64Array(characterIds.length);
  let skillBothAverageRate = new Float64Array(characterIds.length);
  let skillBothLeaderRate = new Float64Array(characterIds.length);
  let skillMixedAverageRate = new Float64Array(characterIds.length);
  let skillMixedLeaderRate = new Float64Array(characterIds.length);
  let leaderScoreUpPercent = new Float64Array(characterIds.length);
  let leaderSameBandScoreUpPercent = new Float64Array(characterIds.length);
  let leaderSameAttributeScoreUpPercent = new Float64Array(characterIds.length);
  let leaderBothScoreUpPercent = new Float64Array(characterIds.length);
  let leaderMixedScoreUpPercent = new Float64Array(characterIds.length);
  const powerByStartIndex = new Array<Float64Array>(cards.length + 1);
  const pointBonusRateByStartIndex = new Array<Float64Array>(cards.length + 1);
  const skillAverageRateByStartIndex = new Array<Float64Array>(cards.length + 1);
  const skillLeaderRateByStartIndex = new Array<Float64Array>(cards.length + 1);
  const skillSameBandAverageRateByStartIndex = new Array<Float64Array>(cards.length + 1);
  const skillSameBandLeaderRateByStartIndex = new Array<Float64Array>(cards.length + 1);
  const skillSameAttributeAverageRateByStartIndex = new Array<Float64Array>(cards.length + 1);
  const skillSameAttributeLeaderRateByStartIndex = new Array<Float64Array>(cards.length + 1);
  const skillBothAverageRateByStartIndex = new Array<Float64Array>(cards.length + 1);
  const skillBothLeaderRateByStartIndex = new Array<Float64Array>(cards.length + 1);
  const skillMixedAverageRateByStartIndex = new Array<Float64Array>(cards.length + 1);
  const skillMixedLeaderRateByStartIndex = new Array<Float64Array>(cards.length + 1);
  const leaderScoreUpPercentByStartIndex = includeLeaderScoreUpBounds ? new Array<Float64Array>(cards.length + 1) : [];
  const leaderSameBandScoreUpPercentByStartIndex = includeLeaderScoreUpBounds ? new Array<Float64Array>(cards.length + 1) : [];
  const leaderSameAttributeScoreUpPercentByStartIndex = includeLeaderScoreUpBounds ? new Array<Float64Array>(cards.length + 1) : [];
  const leaderBothScoreUpPercentByStartIndex = includeLeaderScoreUpBounds ? new Array<Float64Array>(cards.length + 1) : [];
  const leaderMixedScoreUpPercentByStartIndex = includeLeaderScoreUpBounds ? new Array<Float64Array>(cards.length + 1) : [];

  powerByStartIndex[cards.length] = power.slice();
  pointBonusRateByStartIndex[cards.length] = pointBonusRate.slice();
  skillAverageRateByStartIndex[cards.length] = shouldBuildDefaultSkillMode ? skillAverageRate.slice() : emptySkillRates;
  skillLeaderRateByStartIndex[cards.length] = shouldBuildDefaultSkillMode ? skillLeaderRate.slice() : emptySkillRates;
  skillSameBandAverageRateByStartIndex[cards.length] = shouldBuildSameBandSkillMode ? skillSameBandAverageRate.slice() : emptySkillRates;
  skillSameBandLeaderRateByStartIndex[cards.length] = shouldBuildSameBandSkillMode ? skillSameBandLeaderRate.slice() : emptySkillRates;
  skillSameAttributeAverageRateByStartIndex[cards.length] = shouldBuildSameAttributeSkillMode ? skillSameAttributeAverageRate.slice() : emptySkillRates;
  skillSameAttributeLeaderRateByStartIndex[cards.length] = shouldBuildSameAttributeSkillMode ? skillSameAttributeLeaderRate.slice() : emptySkillRates;
  skillBothAverageRateByStartIndex[cards.length] = shouldBuildBothSkillMode ? skillBothAverageRate.slice() : emptySkillRates;
  skillBothLeaderRateByStartIndex[cards.length] = shouldBuildBothSkillMode ? skillBothLeaderRate.slice() : emptySkillRates;
  skillMixedAverageRateByStartIndex[cards.length] = shouldBuildMixedSkillMode ? skillMixedAverageRate.slice() : emptySkillRates;
  skillMixedLeaderRateByStartIndex[cards.length] = shouldBuildMixedSkillMode ? skillMixedLeaderRate.slice() : emptySkillRates;
  if (includeLeaderScoreUpBounds) {
    leaderScoreUpPercentByStartIndex[cards.length] = shouldBuildDefaultSkillMode ? leaderScoreUpPercent.slice() : emptySkillRates;
    leaderSameBandScoreUpPercentByStartIndex[cards.length] = shouldBuildSameBandSkillMode ? leaderSameBandScoreUpPercent.slice() : emptySkillRates;
    leaderSameAttributeScoreUpPercentByStartIndex[cards.length] = shouldBuildSameAttributeSkillMode ? leaderSameAttributeScoreUpPercent.slice() : emptySkillRates;
    leaderBothScoreUpPercentByStartIndex[cards.length] = shouldBuildBothSkillMode ? leaderBothScoreUpPercent.slice() : emptySkillRates;
    leaderMixedScoreUpPercentByStartIndex[cards.length] = shouldBuildMixedSkillMode ? leaderMixedScoreUpPercent.slice() : emptySkillRates;
  }

  for (let index = cards.length - 1; index >= 0; index -= 1) {
    const card = cards[index];
    const characterIndex = characterIndexById.get(card.characterId);
    power = power.slice();
    pointBonusRate = pointBonusRate.slice();
    if (shouldBuildDefaultSkillMode) {
      skillAverageRate = skillAverageRate.slice();
      skillLeaderRate = skillLeaderRate.slice();
    }
    if (shouldBuildSameBandSkillMode) {
      skillSameBandAverageRate = skillSameBandAverageRate.slice();
      skillSameBandLeaderRate = skillSameBandLeaderRate.slice();
    }
    if (shouldBuildSameAttributeSkillMode) {
      skillSameAttributeAverageRate = skillSameAttributeAverageRate.slice();
      skillSameAttributeLeaderRate = skillSameAttributeLeaderRate.slice();
    }
    if (shouldBuildBothSkillMode) {
      skillBothAverageRate = skillBothAverageRate.slice();
      skillBothLeaderRate = skillBothLeaderRate.slice();
    }
    if (shouldBuildMixedSkillMode) {
      skillMixedAverageRate = skillMixedAverageRate.slice();
      skillMixedLeaderRate = skillMixedLeaderRate.slice();
    }
    if (includeLeaderScoreUpBounds) {
      if (shouldBuildDefaultSkillMode) {
        leaderScoreUpPercent = leaderScoreUpPercent.slice();
      }
      if (shouldBuildSameBandSkillMode) {
        leaderSameBandScoreUpPercent = leaderSameBandScoreUpPercent.slice();
      }
      if (shouldBuildSameAttributeSkillMode) {
        leaderSameAttributeScoreUpPercent = leaderSameAttributeScoreUpPercent.slice();
      }
      if (shouldBuildBothSkillMode) {
        leaderBothScoreUpPercent = leaderBothScoreUpPercent.slice();
      }
      if (shouldBuildMixedSkillMode) {
        leaderMixedScoreUpPercent = leaderMixedScoreUpPercent.slice();
      }
    }
    if (characterIndex !== undefined) {
      power[characterIndex] = Math.max(power[characterIndex], card.effectivePower);
      pointBonusRate[characterIndex] = Math.max(pointBonusRate[characterIndex], card.pointBonusRate);
      if (shouldBuildDefaultSkillMode) {
        skillAverageRate[characterIndex] = Math.max(skillAverageRate[characterIndex], card.skillAverageRate);
        skillLeaderRate[characterIndex] = Math.max(skillLeaderRate[characterIndex], card.skillLeaderRate);
        if (includeLeaderScoreUpBounds) {
          leaderScoreUpPercent[characterIndex] = Math.max(leaderScoreUpPercent[characterIndex], card.leaderScoreUpPercent);
        }
      }
      if (shouldBuildSameBandSkillMode) {
        skillSameBandAverageRate[characterIndex] = Math.max(skillSameBandAverageRate[characterIndex], card.skillSameBandAverageRate);
        skillSameBandLeaderRate[characterIndex] = Math.max(skillSameBandLeaderRate[characterIndex], card.skillSameBandLeaderRate);
        if (includeLeaderScoreUpBounds) {
          leaderSameBandScoreUpPercent[characterIndex] = Math.max(leaderSameBandScoreUpPercent[characterIndex], card.leaderSameBandScoreUpPercent);
        }
      }
      if (shouldBuildSameAttributeSkillMode) {
        skillSameAttributeAverageRate[characterIndex] = Math.max(skillSameAttributeAverageRate[characterIndex], card.skillSameAttributeAverageRate);
        skillSameAttributeLeaderRate[characterIndex] = Math.max(skillSameAttributeLeaderRate[characterIndex], card.skillSameAttributeLeaderRate);
        if (includeLeaderScoreUpBounds) {
          leaderSameAttributeScoreUpPercent[characterIndex] = Math.max(leaderSameAttributeScoreUpPercent[characterIndex], card.leaderSameAttributeScoreUpPercent);
        }
      }
      if (shouldBuildBothSkillMode) {
        skillBothAverageRate[characterIndex] = Math.max(skillBothAverageRate[characterIndex], card.skillBothAverageRate);
        skillBothLeaderRate[characterIndex] = Math.max(skillBothLeaderRate[characterIndex], card.skillBothLeaderRate);
        if (includeLeaderScoreUpBounds) {
          leaderBothScoreUpPercent[characterIndex] = Math.max(leaderBothScoreUpPercent[characterIndex], card.leaderBothScoreUpPercent);
        }
      }
      if (shouldBuildMixedSkillMode) {
        skillMixedAverageRate[characterIndex] = Math.max(skillMixedAverageRate[characterIndex], card.skillMixedAverageRate);
        skillMixedLeaderRate[characterIndex] = Math.max(skillMixedLeaderRate[characterIndex], card.skillMixedLeaderRate);
        if (includeLeaderScoreUpBounds) {
          leaderMixedScoreUpPercent[characterIndex] = Math.max(leaderMixedScoreUpPercent[characterIndex], card.leaderMixedScoreUpPercent);
        }
      }
    }
    powerByStartIndex[index] = power;
    pointBonusRateByStartIndex[index] = pointBonusRate;
    skillAverageRateByStartIndex[index] = shouldBuildDefaultSkillMode ? skillAverageRate : emptySkillRates;
    skillLeaderRateByStartIndex[index] = shouldBuildDefaultSkillMode ? skillLeaderRate : emptySkillRates;
    skillSameBandAverageRateByStartIndex[index] = shouldBuildSameBandSkillMode ? skillSameBandAverageRate : emptySkillRates;
    skillSameBandLeaderRateByStartIndex[index] = shouldBuildSameBandSkillMode ? skillSameBandLeaderRate : emptySkillRates;
    skillSameAttributeAverageRateByStartIndex[index] = shouldBuildSameAttributeSkillMode ? skillSameAttributeAverageRate : emptySkillRates;
    skillSameAttributeLeaderRateByStartIndex[index] = shouldBuildSameAttributeSkillMode ? skillSameAttributeLeaderRate : emptySkillRates;
    skillBothAverageRateByStartIndex[index] = shouldBuildBothSkillMode ? skillBothAverageRate : emptySkillRates;
    skillBothLeaderRateByStartIndex[index] = shouldBuildBothSkillMode ? skillBothLeaderRate : emptySkillRates;
    skillMixedAverageRateByStartIndex[index] = shouldBuildMixedSkillMode ? skillMixedAverageRate : emptySkillRates;
    skillMixedLeaderRateByStartIndex[index] = shouldBuildMixedSkillMode ? skillMixedLeaderRate : emptySkillRates;
    if (includeLeaderScoreUpBounds) {
      leaderScoreUpPercentByStartIndex[index] = shouldBuildDefaultSkillMode ? leaderScoreUpPercent : emptySkillRates;
      leaderSameBandScoreUpPercentByStartIndex[index] = shouldBuildSameBandSkillMode ? leaderSameBandScoreUpPercent : emptySkillRates;
      leaderSameAttributeScoreUpPercentByStartIndex[index] = shouldBuildSameAttributeSkillMode ? leaderSameAttributeScoreUpPercent : emptySkillRates;
      leaderBothScoreUpPercentByStartIndex[index] = shouldBuildBothSkillMode ? leaderBothScoreUpPercent : emptySkillRates;
      leaderMixedScoreUpPercentByStartIndex[index] = shouldBuildMixedSkillMode ? leaderMixedScoreUpPercent : emptySkillRates;
    }
  }

  return {
    characterIds,
    characterIndexById,
    characterBandIds,
    bandIds,
    powerByStartIndex,
    pointBonusRateByStartIndex,
    skillAverageRateByStartIndex,
    skillLeaderRateByStartIndex,
    skillSameBandAverageRateByStartIndex,
    skillSameBandLeaderRateByStartIndex,
    skillSameAttributeAverageRateByStartIndex,
    skillSameAttributeLeaderRateByStartIndex,
    skillBothAverageRateByStartIndex,
    skillBothLeaderRateByStartIndex,
    skillMixedAverageRateByStartIndex,
    skillMixedLeaderRateByStartIndex,
    leaderScoreUpPercentByStartIndex,
    leaderSameBandScoreUpPercentByStartIndex,
    leaderSameAttributeScoreUpPercentByStartIndex,
    leaderBothScoreUpPercentByStartIndex,
    leaderMixedScoreUpPercentByStartIndex,
  };
}

export function insertTopValue(values: number[], value: number): void {
  // Hot path over tiny arrays; manual insertion avoids repeated push/sort allocation.
  for (let index = 0; index < values.length; index += 1) {
    if (value <= values[index]) {
      continue;
    }

    for (let moveIndex = values.length - 1; moveIndex > index; moveIndex -= 1) {
      values[moveIndex] = values[moveIndex - 1];
    }
    values[index] = value;
    return;
  }
}

export function sumTopFiveValues(
  count: number,
  first: number,
  second: number,
  third: number,
  fourth: number,
  fifth: number,
): number {
  let sum = 0;
  if (count >= 1) {
    sum += Math.max(0, first);
  }
  if (count >= 2) {
    sum += Math.max(0, second);
  }
  if (count >= 3) {
    sum += Math.max(0, third);
  }
  if (count >= 4) {
    sum += Math.max(0, fourth);
  }
  if (count >= 5) {
    sum += Math.max(0, fifth);
  }
  return sum;
}

function sumTopFiveValuesExcluding(
  count: number,
  excludedIndex: number,
  first: number,
  firstIndex: number,
  second: number,
  secondIndex: number,
  third: number,
  thirdIndex: number,
  fourth: number,
  fourthIndex: number,
  fifth: number,
  fifthIndex: number,
): number {
  if (count <= 0) {
    return 0;
  }

  let sum = 0;
  let includedCount = 0;
  if (firstIndex !== excludedIndex && count >= includedCount + 1) {
    sum += Math.max(0, first);
    includedCount += 1;
  }
  if (secondIndex !== excludedIndex && count >= includedCount + 1) {
    sum += Math.max(0, second);
    includedCount += 1;
  }
  if (thirdIndex !== excludedIndex && count >= includedCount + 1) {
    sum += Math.max(0, third);
    includedCount += 1;
  }
  if (fourthIndex !== excludedIndex && count >= includedCount + 1) {
    sum += Math.max(0, fourth);
    includedCount += 1;
  }
  if (fifthIndex !== excludedIndex && count >= includedCount + 1) {
    sum += Math.max(0, fifth);
    includedCount += 1;
  }

  return includedCount >= count ? sum : Number.NEGATIVE_INFINITY;
}

export function estimateSearchScopePowerUpperBound(
  selectedCards: SearchCard[],
  upperBoundIndex: CharacterUpperBoundIndex,
  searchCards: SearchCard[],
  startIndex: number,
  usedCharacterMaskLow: number,
  usedCharacterMaskHigh: number,
  selectedPower?: number,
): number {
  const remaining = 5 - selectedCards.length;
  const currentPower = selectedPower ?? selectedCards.reduce((sum, card) => sum + card.effectivePower, 0);
  if (remaining === 0) {
    return Math.floor(currentPower);
  }

  const boundedStartIndex = clamp(startIndex, 0, searchCards.length);
  const powerByCharacter = upperBoundIndex.powerByStartIndex[boundedStartIndex];
  let topPower1 = Number.NEGATIVE_INFINITY;
  let topPower2 = Number.NEGATIVE_INFINITY;
  let topPower3 = Number.NEGATIVE_INFINITY;
  let topPower4 = Number.NEGATIVE_INFINITY;
  let topPower5 = Number.NEGATIVE_INFINITY;
  let availableCharacterCount = 0;

  for (let characterIndex = 0; characterIndex < upperBoundIndex.characterIds.length; characterIndex += 1) {
    if (hasCharacterIndexInMask(usedCharacterMaskLow, usedCharacterMaskHigh, characterIndex)) {
      continue;
    }

    const power = powerByCharacter[characterIndex] ?? 0;
    availableCharacterCount += 1;
    if (power > topPower1) {
      topPower5 = topPower4;
      topPower4 = topPower3;
      topPower3 = topPower2;
      topPower2 = topPower1;
      topPower1 = power;
    } else if (power > topPower2) {
      topPower5 = topPower4;
      topPower4 = topPower3;
      topPower3 = topPower2;
      topPower2 = power;
    } else if (power > topPower3) {
      topPower5 = topPower4;
      topPower4 = topPower3;
      topPower3 = power;
    } else if (power > topPower4) {
      topPower5 = topPower4;
      topPower4 = power;
    } else if (power > topPower5) {
      topPower5 = power;
    }
  }

  if (availableCharacterCount < remaining) {
    return Number.NEGATIVE_INFINITY;
  }

  return Math.floor(currentPower + sumTopFiveValues(
    remaining,
    topPower1,
    topPower2,
    topPower3,
    topPower4,
    topPower5,
  ));
}

function getSkillAverageRateUpperArray(
  upperBoundIndex: CharacterUpperBoundIndex,
  startIndex: number,
  skillContextUpperMode: SkillContextUpperMode,
): Float64Array {
  const boundedStartIndex = clamp(startIndex, 0, upperBoundIndex.powerByStartIndex.length - 1);
  return skillContextUpperMode === "mixed"
    ? upperBoundIndex.skillMixedAverageRateByStartIndex[boundedStartIndex]
    : skillContextUpperMode === "same-band"
      ? upperBoundIndex.skillSameBandAverageRateByStartIndex[boundedStartIndex]
      : skillContextUpperMode === "same-attribute"
        ? upperBoundIndex.skillSameAttributeAverageRateByStartIndex[boundedStartIndex]
        : skillContextUpperMode === "both"
          ? upperBoundIndex.skillBothAverageRateByStartIndex[boundedStartIndex]
          : upperBoundIndex.skillAverageRateByStartIndex[boundedStartIndex];
}

function getSkillLeaderRateUpperArray(
  upperBoundIndex: CharacterUpperBoundIndex,
  startIndex: number,
  skillContextUpperMode: SkillContextUpperMode,
): Float64Array {
  const boundedStartIndex = clamp(startIndex, 0, upperBoundIndex.powerByStartIndex.length - 1);
  return skillContextUpperMode === "mixed"
    ? upperBoundIndex.skillMixedLeaderRateByStartIndex[boundedStartIndex]
    : skillContextUpperMode === "same-band"
      ? upperBoundIndex.skillSameBandLeaderRateByStartIndex[boundedStartIndex]
      : skillContextUpperMode === "same-attribute"
        ? upperBoundIndex.skillSameAttributeLeaderRateByStartIndex[boundedStartIndex]
        : skillContextUpperMode === "both"
          ? upperBoundIndex.skillBothLeaderRateByStartIndex[boundedStartIndex]
          : upperBoundIndex.skillLeaderRateByStartIndex[boundedStartIndex];
}

export function estimateAverageSkillRateUpper(
  selectedCards: SearchCard[],
  remainingSkillAverageRates: number[],
  remainingSkillLeaderRates: number[],
  skillContextUpperMode: SkillContextUpperMode,
): number {
  if (selectedCards.length === 0 && remainingSkillAverageRates.length === 0) {
    return 0;
  }

  const topAverageRates = [0, 0, 0, 0, 0];
  let leaderRate = 0;

  for (const card of selectedCards) {
    insertTopValue(topAverageRates, getCardSkillAverageRateForUpperMode(card, skillContextUpperMode));
    leaderRate = Math.max(leaderRate, getCardSkillLeaderRateForUpperMode(card, skillContextUpperMode));
  }
  for (const rate of remainingSkillAverageRates) {
    insertTopValue(topAverageRates, rate);
  }
  for (const rate of remainingSkillLeaderRates) {
    leaderRate = Math.max(leaderRate, rate);
  }

  return topAverageRates.reduce((sum, rate) => sum + rate, leaderRate);
}

export const CHARACTER_MASK_SEGMENT_BITS = 30;

export function hasCharacterIndexInMask(maskLow: number, maskHigh: number, characterIndex: number): boolean {
  if (characterIndex < CHARACTER_MASK_SEGMENT_BITS) {
    return (maskLow & (1 << characterIndex)) !== 0;
  }
  return (maskHigh & (1 << (characterIndex - CHARACTER_MASK_SEGMENT_BITS))) !== 0;
}

export function getCardSkillAverageRateForUpperMode(card: SearchCard, mode: SkillContextUpperMode): number {
  if (mode === "mixed") {
    return card.skillMixedAverageRate;
  }
  if (mode === "same-band") {
    return card.skillSameBandAverageRate;
  }
  if (mode === "same-attribute") {
    return card.skillSameAttributeAverageRate;
  }
  if (mode === "both") {
    return card.skillBothAverageRate;
  }
  return card.skillAverageRate;
}

export function getCardSkillLeaderRateForUpperMode(card: SearchCard, mode: SkillContextUpperMode): number {
  if (mode === "mixed") {
    return card.skillMixedLeaderRate;
  }
  if (mode === "same-band") {
    return card.skillSameBandLeaderRate;
  }
  if (mode === "same-attribute") {
    return card.skillSameAttributeLeaderRate;
  }
  if (mode === "both") {
    return card.skillBothLeaderRate;
  }
  return card.skillLeaderRate;
}

export function getCardLeaderScoreUpPercentForUpperMode(card: SearchCard, mode: SkillContextUpperMode): number {
  if (mode === "mixed") {
    return card.leaderMixedScoreUpPercent;
  }
  if (mode === "same-band") {
    return card.leaderSameBandScoreUpPercent;
  }
  if (mode === "same-attribute") {
    return card.leaderSameAttributeScoreUpPercent;
  }
  if (mode === "both") {
    return card.leaderBothScoreUpPercent;
  }
  return card.leaderScoreUpPercent;
}

function getLeaderScoreUpPercentUpperArray(
  upperBoundIndex: CharacterUpperBoundIndex,
  startIndex: number,
  mode?: SkillContextUpperMode,
): Float64Array {
  if (mode === "mixed") {
    return upperBoundIndex.leaderMixedScoreUpPercentByStartIndex[startIndex];
  }
  if (mode === "same-band") {
    return upperBoundIndex.leaderSameBandScoreUpPercentByStartIndex[startIndex];
  }
  if (mode === "same-attribute") {
    return upperBoundIndex.leaderSameAttributeScoreUpPercentByStartIndex[startIndex];
  }
  if (mode === "both") {
    return upperBoundIndex.leaderBothScoreUpPercentByStartIndex[startIndex];
  }
  return upperBoundIndex.leaderScoreUpPercentByStartIndex[startIndex];
}

export function estimateSearchScopeLeaderScoreUpPercentUpperBound(
  selectedCards: SearchCard[],
  upperBoundIndex: CharacterUpperBoundIndex,
  searchCards: SearchCard[],
  startIndex: number,
  usedCharacterMaskLow: number,
  usedCharacterMaskHigh: number,
  skillContextUpperMode?: SkillContextUpperMode,
): number {
  const boundedStartIndex = clamp(startIndex, 0, searchCards.length);
  const leaderScoreUpPercentByCharacter = getLeaderScoreUpPercentUpperArray(
    upperBoundIndex,
    boundedStartIndex,
    skillContextUpperMode,
  );
  let upperBound = 0;

  for (const card of selectedCards) {
    upperBound = Math.max(
      upperBound,
      skillContextUpperMode
        ? getCardLeaderScoreUpPercentForUpperMode(card, skillContextUpperMode)
        : card.leaderScoreUpPercent,
    );
  }

  for (let characterIndex = 0; characterIndex < upperBoundIndex.characterIds.length; characterIndex += 1) {
    if (hasCharacterIndexInMask(usedCharacterMaskLow, usedCharacterMaskHigh, characterIndex)) {
      continue;
    }
    upperBound = Math.max(upperBound, leaderScoreUpPercentByCharacter[characterIndex] ?? 0);
  }

  return upperBound;
}

function sumSelectedSkillAverageRateForUpperMode(cards: SearchCard[], mode: SkillContextUpperMode): number {
  let sum = 0;
  for (const card of cards) {
    sum += getCardSkillAverageRateForUpperMode(card, mode);
  }
  return sum;
}

function maxSelectedSkillLeaderRateForUpperMode(cards: SearchCard[], mode: SkillContextUpperMode): number {
  let maxRate = 0;
  for (const card of cards) {
    maxRate = Math.max(maxRate, getCardSkillLeaderRateForUpperMode(card, mode));
  }
  return maxRate;
}

function isUpperBoundBelowThreshold(upperBound: number, threshold: number): boolean {
  if (upperBound === Number.NEGATIVE_INFINITY) {
    return true;
  }
  return Number.isFinite(upperBound) && upperBound < threshold;
}

export function isSearchUpperBoundBelowResultThreshold(
  targetUpperBound: number,
  scoreUpperBound: number,
  thresholdResult: BandoriTeamSearchResult | undefined,
): boolean {
  if (!thresholdResult) {
    return false;
  }
  if (isUpperBoundBelowThreshold(targetUpperBound, thresholdResult.targetValue)) {
    return true;
  }
  if (thresholdResult.target === "eventPoint" && targetUpperBound === thresholdResult.targetValue) {
    return false;
  }
  return targetUpperBound === thresholdResult.targetValue && scoreUpperBound < thresholdResult.score;
}

export function compareUpperBoundDesc(left: number, right: number): number {
  const normalizedLeft = left === Number.POSITIVE_INFINITY
    ? Number.MAX_SAFE_INTEGER
    : left === Number.NEGATIVE_INFINITY
      ? Number.MIN_SAFE_INTEGER
      : left;
  const normalizedRight = right === Number.POSITIVE_INFINITY
    ? Number.MAX_SAFE_INTEGER
    : right === Number.NEGATIVE_INFINITY
      ? Number.MIN_SAFE_INTEGER
      : right;
  return normalizedRight - normalizedLeft;
}

function estimateBranchScoreUpperBoundForMode(
  selectedCards: SearchCard[],
  upperBoundIndex: CharacterUpperBoundIndex,
  searchCards: SearchCard[],
  startIndex: number,
  usedCharacterMaskLow: number,
  usedCharacterMaskHigh: number,
  baseScoreRatePerPower: number,
  skillContextUpperMode: SkillContextUpperMode,
  requiredBandId?: number,
  selectedPower?: number,
  selectedSkillAverageRate?: number,
  selectedSkillLeaderRate?: number,
): number {
  // For a fixed skill context, score bound = selected power + top remaining distinct-character power, plus skill average/leader bounds.
  // Power and skill rate are topped independently on purpose; the bound is looser but safe for pruning.
  if (requiredBandId !== undefined) {
    for (const card of selectedCards) {
      if (card.bandId !== requiredBandId) {
        return Number.NEGATIVE_INFINITY;
      }
    }
  }

  const remaining = 5 - selectedCards.length;
  const selectedAverageRate = selectedSkillAverageRate
    ?? sumSelectedSkillAverageRateForUpperMode(selectedCards, skillContextUpperMode);
  const selectedLeaderRate = selectedSkillLeaderRate
    ?? maxSelectedSkillLeaderRateForUpperMode(selectedCards, skillContextUpperMode);
  if (remaining === 0) {
    const power = selectedPower ?? selectedCards.reduce((sum, card) => sum + card.effectivePower, 0);
    const skillRateUpper = selectedAverageRate + selectedLeaderRate;
    return Math.floor(power) * (baseScoreRatePerPower + skillRateUpper);
  }

  const currentPower = selectedPower ?? selectedCards.reduce((sum, card) => sum + card.effectivePower, 0);
  const boundedStartIndex = clamp(startIndex, 0, searchCards.length);
  const powerByCharacter = upperBoundIndex.powerByStartIndex[boundedStartIndex];
  const skillAverageRateByCharacter = getSkillAverageRateUpperArray(upperBoundIndex, boundedStartIndex, skillContextUpperMode);
  const skillLeaderRateByCharacter = getSkillLeaderRateUpperArray(upperBoundIndex, boundedStartIndex, skillContextUpperMode);
  let topPower1 = Number.NEGATIVE_INFINITY;
  let topPower2 = Number.NEGATIVE_INFINITY;
  let topPower3 = Number.NEGATIVE_INFINITY;
  let topPower4 = Number.NEGATIVE_INFINITY;
  let topPower5 = Number.NEGATIVE_INFINITY;
  let topSkillAverageRate1 = Number.NEGATIVE_INFINITY;
  let topSkillAverageRate2 = Number.NEGATIVE_INFINITY;
  let topSkillAverageRate3 = Number.NEGATIVE_INFINITY;
  let topSkillAverageRate4 = Number.NEGATIVE_INFINITY;
  let topSkillAverageRate5 = Number.NEGATIVE_INFINITY;
  let skillLeaderRateUpper = selectedLeaderRate;
  let availableCharacterCount = 0;

  for (let characterIndex = 0; characterIndex < upperBoundIndex.characterIds.length; characterIndex += 1) {
    if (hasCharacterIndexInMask(usedCharacterMaskLow, usedCharacterMaskHigh, characterIndex)) {
      continue;
    }
    if (
      requiredBandId !== undefined
      && upperBoundIndex.characterBandIds[characterIndex] !== requiredBandId
    ) {
      continue;
    }
    const power = powerByCharacter[characterIndex] ?? 0;
    if (power <= 0) {
      continue;
    }
    availableCharacterCount += 1;
    if (power > topPower1) {
      topPower5 = topPower4;
      topPower4 = topPower3;
      topPower3 = topPower2;
      topPower2 = topPower1;
      topPower1 = power;
    } else if (power > topPower2) {
      topPower5 = topPower4;
      topPower4 = topPower3;
      topPower3 = topPower2;
      topPower2 = power;
    } else if (power > topPower3) {
      topPower5 = topPower4;
      topPower4 = topPower3;
      topPower3 = power;
    } else if (power > topPower4) {
      topPower5 = topPower4;
      topPower4 = power;
    } else if (power > topPower5) {
      topPower5 = power;
    }

    const skillAverageRate = skillAverageRateByCharacter[characterIndex] ?? 0;
    if (skillAverageRate > topSkillAverageRate1) {
      topSkillAverageRate5 = topSkillAverageRate4;
      topSkillAverageRate4 = topSkillAverageRate3;
      topSkillAverageRate3 = topSkillAverageRate2;
      topSkillAverageRate2 = topSkillAverageRate1;
      topSkillAverageRate1 = skillAverageRate;
    } else if (skillAverageRate > topSkillAverageRate2) {
      topSkillAverageRate5 = topSkillAverageRate4;
      topSkillAverageRate4 = topSkillAverageRate3;
      topSkillAverageRate3 = topSkillAverageRate2;
      topSkillAverageRate2 = skillAverageRate;
    } else if (skillAverageRate > topSkillAverageRate3) {
      topSkillAverageRate5 = topSkillAverageRate4;
      topSkillAverageRate4 = topSkillAverageRate3;
      topSkillAverageRate3 = skillAverageRate;
    } else if (skillAverageRate > topSkillAverageRate4) {
      topSkillAverageRate5 = topSkillAverageRate4;
      topSkillAverageRate4 = skillAverageRate;
    } else if (skillAverageRate > topSkillAverageRate5) {
      topSkillAverageRate5 = skillAverageRate;
    }
    skillLeaderRateUpper = Math.max(skillLeaderRateUpper, skillLeaderRateByCharacter[characterIndex] ?? 0);
  }

  if (availableCharacterCount < remaining) {
    return Number.NEGATIVE_INFINITY;
  }

  const upperPower = currentPower + sumTopFiveValues(
    remaining,
    topPower1,
    topPower2,
    topPower3,
    topPower4,
    topPower5,
  );
  const skillAverageRateUpper = selectedAverageRate
    + sumTopFiveValues(
      remaining,
      topSkillAverageRate1,
      topSkillAverageRate2,
      topSkillAverageRate3,
      topSkillAverageRate4,
      topSkillAverageRate5,
    );
  const skillRateUpper = skillAverageRateUpper + skillLeaderRateUpper;
  return Math.floor(upperPower) * (baseScoreRatePerPower + skillRateUpper);
}

function estimateBranchScoreUpperBound(
  selectedCards: SearchCard[],
  upperBoundIndex: CharacterUpperBoundIndex,
  searchCards: SearchCard[],
  startIndex: number,
  usedCharacterMaskLow: number,
  usedCharacterMaskHigh: number,
  baseScoreRatePerPower: number,
  selectedPower?: number,
): number {
  // Without partitioning, enumerate mixed, same-band, same-attribute, and both contexts, then use the max as one optimistic bound.
  let maxScore = estimateBranchScoreUpperBoundForMode(
    selectedCards,
    upperBoundIndex,
    searchCards,
    startIndex,
    usedCharacterMaskLow,
    usedCharacterMaskHigh,
    baseScoreRatePerPower,
    "mixed",
    undefined,
    selectedPower,
  );
  const possibleSameBandIds = getPossibleSameBandIds(selectedCards, upperBoundIndex);
  const canKeepSameAttribute = canKeepSameAttributeContext(selectedCards);

  for (const bandId of possibleSameBandIds) {
    maxScore = Math.max(
      maxScore,
      estimateBranchScoreUpperBoundForMode(
        selectedCards,
        upperBoundIndex,
        searchCards,
        startIndex,
        usedCharacterMaskLow,
        usedCharacterMaskHigh,
        baseScoreRatePerPower,
        "same-band",
        bandId,
        selectedPower,
      ),
    );
  }

  if (canKeepSameAttribute) {
    maxScore = Math.max(
      maxScore,
      estimateBranchScoreUpperBoundForMode(
        selectedCards,
        upperBoundIndex,
        searchCards,
        startIndex,
        usedCharacterMaskLow,
        usedCharacterMaskHigh,
        baseScoreRatePerPower,
        "same-attribute",
        undefined,
        selectedPower,
      ),
    );

    for (const bandId of possibleSameBandIds) {
      maxScore = Math.max(
        maxScore,
        estimateBranchScoreUpperBoundForMode(
          selectedCards,
          upperBoundIndex,
          searchCards,
          startIndex,
          usedCharacterMaskLow,
          usedCharacterMaskHigh,
          baseScoreRatePerPower,
          "both",
          bandId,
          selectedPower,
        ),
      );
    }
  }

  return maxScore;
}

export function estimateSearchScopeScoreUpperBound(
  selectedCards: SearchCard[],
  upperBoundIndex: CharacterUpperBoundIndex,
  searchCards: SearchCard[],
  startIndex: number,
  usedCharacterMaskLow: number,
  usedCharacterMaskHigh: number,
  baseScoreRatePerPower: number,
  skillContextUpperMode?: SkillContextUpperMode,
  selectedPower?: number,
  selectedSkillAverageRate?: number,
  selectedSkillLeaderRate?: number,
): number {
  if (skillContextUpperMode) {
    return estimateBranchScoreUpperBoundForMode(
      selectedCards,
      upperBoundIndex,
      searchCards,
      startIndex,
      usedCharacterMaskLow,
      usedCharacterMaskHigh,
      baseScoreRatePerPower,
      skillContextUpperMode,
      undefined,
      selectedPower,
      selectedSkillAverageRate,
      selectedSkillLeaderRate,
    );
  }

  return estimateBranchScoreUpperBound(
    selectedCards,
    upperBoundIndex,
    searchCards,
    startIndex,
    usedCharacterMaskLow,
    usedCharacterMaskHigh,
    baseScoreRatePerPower,
    selectedPower,
  );
}

export function estimateSearchScopeScoreUpperBoundWithLeaderConstraint(
  selectedCards: SearchCard[],
  upperBoundIndex: CharacterUpperBoundIndex,
  searchCards: SearchCard[],
  startIndex: number,
  usedCharacterMaskLow: number,
  usedCharacterMaskHigh: number,
  baseScoreRatePerPower: number,
  skillContextUpperMode: SkillContextUpperMode | undefined,
  minLeaderScoreUpPercent: number | null,
  selectedPower?: number,
  selectedSkillAverageRate?: number,
): number | null {
  if (!skillContextUpperMode || minLeaderScoreUpPercent === null) {
    return null;
  }

  const remaining = 5 - selectedCards.length;
  const currentPower = selectedPower ?? selectedCards.reduce((sum, card) => sum + card.effectivePower, 0);
  const selectedAverageRate = selectedSkillAverageRate
    ?? sumSelectedSkillAverageRateForUpperMode(selectedCards, skillContextUpperMode);
  let leaderSkillRateUpper = 0;
  let selectedHasEligibleLeader = false;

  for (const card of selectedCards) {
    if (getCardLeaderScoreUpPercentForUpperMode(card, skillContextUpperMode) < minLeaderScoreUpPercent) {
      continue;
    }
    selectedHasEligibleLeader = true;
    leaderSkillRateUpper = Math.max(
      leaderSkillRateUpper,
      getCardSkillLeaderRateForUpperMode(card, skillContextUpperMode),
    );
  }

  if (remaining === 0) {
    if (!selectedHasEligibleLeader) {
      return Number.NEGATIVE_INFINITY;
    }
    return Math.floor(currentPower) * (baseScoreRatePerPower + selectedAverageRate + leaderSkillRateUpper);
  }

  const boundedStartIndex = clamp(startIndex, 0, searchCards.length);
  const powerByCharacter = upperBoundIndex.powerByStartIndex[boundedStartIndex];
  const skillAverageRateByCharacter = getSkillAverageRateUpperArray(upperBoundIndex, boundedStartIndex, skillContextUpperMode);
  const skillLeaderRateByCharacter = getSkillLeaderRateUpperArray(upperBoundIndex, boundedStartIndex, skillContextUpperMode);
  const leaderScoreUpPercentByCharacter = getLeaderScoreUpPercentUpperArray(
    upperBoundIndex,
    boundedStartIndex,
    skillContextUpperMode,
  );
  let topPower1 = Number.NEGATIVE_INFINITY;
  let topPower2 = Number.NEGATIVE_INFINITY;
  let topPower3 = Number.NEGATIVE_INFINITY;
  let topPower4 = Number.NEGATIVE_INFINITY;
  let topPower5 = Number.NEGATIVE_INFINITY;
  let topPowerIndex1 = -1;
  let topPowerIndex2 = -1;
  let topPowerIndex3 = -1;
  let topPowerIndex4 = -1;
  let topPowerIndex5 = -1;
  let topSkillAverageRate1 = Number.NEGATIVE_INFINITY;
  let topSkillAverageRate2 = Number.NEGATIVE_INFINITY;
  let topSkillAverageRate3 = Number.NEGATIVE_INFINITY;
  let topSkillAverageRate4 = Number.NEGATIVE_INFINITY;
  let topSkillAverageRate5 = Number.NEGATIVE_INFINITY;
  let topSkillAverageRateIndex1 = -1;
  let topSkillAverageRateIndex2 = -1;
  let topSkillAverageRateIndex3 = -1;
  let topSkillAverageRateIndex4 = -1;
  let topSkillAverageRateIndex5 = -1;
  let availableCharacterCount = 0;
  let hasEligibleRemainingLeader = false;
  let requiredLeaderPowerUpper = Number.NEGATIVE_INFINITY;
  let requiredLeaderSkillAverageRateUpper = Number.NEGATIVE_INFINITY;

  for (let characterIndex = 0; characterIndex < upperBoundIndex.characterIds.length; characterIndex += 1) {
    if (hasCharacterIndexInMask(usedCharacterMaskLow, usedCharacterMaskHigh, characterIndex)) {
      continue;
    }

    const power = powerByCharacter[characterIndex] ?? 0;
    if (power <= 0) {
      continue;
    }
    availableCharacterCount += 1;
    if (power > topPower1) {
      topPower5 = topPower4;
      topPowerIndex5 = topPowerIndex4;
      topPower4 = topPower3;
      topPowerIndex4 = topPowerIndex3;
      topPower3 = topPower2;
      topPowerIndex3 = topPowerIndex2;
      topPower2 = topPower1;
      topPowerIndex2 = topPowerIndex1;
      topPower1 = power;
      topPowerIndex1 = characterIndex;
    } else if (power > topPower2) {
      topPower5 = topPower4;
      topPowerIndex5 = topPowerIndex4;
      topPower4 = topPower3;
      topPowerIndex4 = topPowerIndex3;
      topPower3 = topPower2;
      topPowerIndex3 = topPowerIndex2;
      topPower2 = power;
      topPowerIndex2 = characterIndex;
    } else if (power > topPower3) {
      topPower5 = topPower4;
      topPowerIndex5 = topPowerIndex4;
      topPower4 = topPower3;
      topPowerIndex4 = topPowerIndex3;
      topPower3 = power;
      topPowerIndex3 = characterIndex;
    } else if (power > topPower4) {
      topPower5 = topPower4;
      topPowerIndex5 = topPowerIndex4;
      topPower4 = power;
      topPowerIndex4 = characterIndex;
    } else if (power > topPower5) {
      topPower5 = power;
      topPowerIndex5 = characterIndex;
    }

    const skillAverageRate = skillAverageRateByCharacter[characterIndex] ?? 0;
    if (skillAverageRate > topSkillAverageRate1) {
      topSkillAverageRate5 = topSkillAverageRate4;
      topSkillAverageRateIndex5 = topSkillAverageRateIndex4;
      topSkillAverageRate4 = topSkillAverageRate3;
      topSkillAverageRateIndex4 = topSkillAverageRateIndex3;
      topSkillAverageRate3 = topSkillAverageRate2;
      topSkillAverageRateIndex3 = topSkillAverageRateIndex2;
      topSkillAverageRate2 = topSkillAverageRate1;
      topSkillAverageRateIndex2 = topSkillAverageRateIndex1;
      topSkillAverageRate1 = skillAverageRate;
      topSkillAverageRateIndex1 = characterIndex;
    } else if (skillAverageRate > topSkillAverageRate2) {
      topSkillAverageRate5 = topSkillAverageRate4;
      topSkillAverageRateIndex5 = topSkillAverageRateIndex4;
      topSkillAverageRate4 = topSkillAverageRate3;
      topSkillAverageRateIndex4 = topSkillAverageRateIndex3;
      topSkillAverageRate3 = topSkillAverageRate2;
      topSkillAverageRateIndex3 = topSkillAverageRateIndex2;
      topSkillAverageRate2 = skillAverageRate;
      topSkillAverageRateIndex2 = characterIndex;
    } else if (skillAverageRate > topSkillAverageRate3) {
      topSkillAverageRate5 = topSkillAverageRate4;
      topSkillAverageRateIndex5 = topSkillAverageRateIndex4;
      topSkillAverageRate4 = topSkillAverageRate3;
      topSkillAverageRateIndex4 = topSkillAverageRateIndex3;
      topSkillAverageRate3 = skillAverageRate;
      topSkillAverageRateIndex3 = characterIndex;
    } else if (skillAverageRate > topSkillAverageRate4) {
      topSkillAverageRate5 = topSkillAverageRate4;
      topSkillAverageRateIndex5 = topSkillAverageRateIndex4;
      topSkillAverageRate4 = skillAverageRate;
      topSkillAverageRateIndex4 = characterIndex;
    } else if (skillAverageRate > topSkillAverageRate5) {
      topSkillAverageRate5 = skillAverageRate;
      topSkillAverageRateIndex5 = characterIndex;
    }

    if ((leaderScoreUpPercentByCharacter[characterIndex] ?? 0) >= minLeaderScoreUpPercent) {
      hasEligibleRemainingLeader = true;
      leaderSkillRateUpper = Math.max(
        leaderSkillRateUpper,
        skillLeaderRateByCharacter[characterIndex] ?? 0,
      );
    }
  }

  if (availableCharacterCount < remaining || (!selectedHasEligibleLeader && !hasEligibleRemainingLeader)) {
    return Number.NEGATIVE_INFINITY;
  }

  if (!selectedHasEligibleLeader) {
    const remainingAfterLeader = remaining - 1;
    for (let characterIndex = 0; characterIndex < upperBoundIndex.characterIds.length; characterIndex += 1) {
      if (hasCharacterIndexInMask(usedCharacterMaskLow, usedCharacterMaskHigh, characterIndex)) {
        continue;
      }
      if ((leaderScoreUpPercentByCharacter[characterIndex] ?? 0) < minLeaderScoreUpPercent) {
        continue;
      }
      const power = powerByCharacter[characterIndex] ?? 0;
      if (power <= 0) {
        continue;
      }
      requiredLeaderPowerUpper = Math.max(
        requiredLeaderPowerUpper,
        power + sumTopFiveValuesExcluding(
          remainingAfterLeader,
          characterIndex,
          topPower1,
          topPowerIndex1,
          topPower2,
          topPowerIndex2,
          topPower3,
          topPowerIndex3,
          topPower4,
          topPowerIndex4,
          topPower5,
          topPowerIndex5,
        ),
      );
      const skillAverageRate = skillAverageRateByCharacter[characterIndex] ?? 0;
      requiredLeaderSkillAverageRateUpper = Math.max(
        requiredLeaderSkillAverageRateUpper,
        skillAverageRate + sumTopFiveValuesExcluding(
          remainingAfterLeader,
          characterIndex,
          topSkillAverageRate1,
          topSkillAverageRateIndex1,
          topSkillAverageRate2,
          topSkillAverageRateIndex2,
          topSkillAverageRate3,
          topSkillAverageRateIndex3,
          topSkillAverageRate4,
          topSkillAverageRateIndex4,
          topSkillAverageRate5,
          topSkillAverageRateIndex5,
        ),
      );
    }
  }

  const remainingPowerUpper = selectedHasEligibleLeader
    ? sumTopFiveValues(
      remaining,
      topPower1,
      topPower2,
      topPower3,
      topPower4,
      topPower5,
    )
    : requiredLeaderPowerUpper;
  const remainingSkillAverageRateUpper = selectedHasEligibleLeader
    ? sumTopFiveValues(
      remaining,
      topSkillAverageRate1,
      topSkillAverageRate2,
      topSkillAverageRate3,
      topSkillAverageRate4,
      topSkillAverageRate5,
    )
    : requiredLeaderSkillAverageRateUpper;
  const upperPower = currentPower + remainingPowerUpper;
  const skillAverageRateUpper = selectedAverageRate + remainingSkillAverageRateUpper;
  return Math.floor(upperPower) * (baseScoreRatePerPower + skillAverageRateUpper + leaderSkillRateUpper);
}

function estimateSearchScopePointBonusRateUpper(
  selectedCards: SearchCard[],
  upperBoundIndex: CharacterUpperBoundIndex,
  cards: SearchCard[],
  startIndex: number,
  usedCharacterMaskLow: number,
  usedCharacterMaskHigh: number,
  requiredBandId?: number,
  selectedPointBonusRate?: number,
): number {
  // Point-bonus bounds also take each remaining distinct character's maximum and affect target bounds only for PT searches.
  if (
    requiredBandId !== undefined
    && selectedCards.some((card) => card.bandId !== requiredBandId)
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  const remaining = 5 - selectedCards.length;
  const selectedRate = selectedPointBonusRate ?? selectedCards.reduce((sum, card) => sum + card.pointBonusRate, 0);
  if (remaining === 0) {
    return selectedRate;
  }

  const boundedStartIndex = clamp(startIndex, 0, cards.length);
  const pointBonusRateByCharacter = upperBoundIndex.pointBonusRateByStartIndex[boundedStartIndex];
  let topRate1 = Number.NEGATIVE_INFINITY;
  let topRate2 = Number.NEGATIVE_INFINITY;
  let topRate3 = Number.NEGATIVE_INFINITY;
  let topRate4 = Number.NEGATIVE_INFINITY;
  let topRate5 = Number.NEGATIVE_INFINITY;
  let availableCharacterCount = 0;

  for (let characterIndex = 0; characterIndex < upperBoundIndex.characterIds.length; characterIndex += 1) {
    if (hasCharacterIndexInMask(usedCharacterMaskLow, usedCharacterMaskHigh, characterIndex)) {
      continue;
    }
    if (
      requiredBandId !== undefined
      && upperBoundIndex.characterBandIds[characterIndex] !== requiredBandId
    ) {
      continue;
    }

    availableCharacterCount += 1;
    const rate = Math.max(0, pointBonusRateByCharacter[characterIndex] ?? 0);
    if (rate > topRate1) {
      topRate5 = topRate4;
      topRate4 = topRate3;
      topRate3 = topRate2;
      topRate2 = topRate1;
      topRate1 = rate;
    } else if (rate > topRate2) {
      topRate5 = topRate4;
      topRate4 = topRate3;
      topRate3 = topRate2;
      topRate2 = rate;
    } else if (rate > topRate3) {
      topRate5 = topRate4;
      topRate4 = topRate3;
      topRate3 = rate;
    } else if (rate > topRate4) {
      topRate5 = topRate4;
      topRate4 = rate;
    } else if (rate > topRate5) {
      topRate5 = rate;
    }
  }

  if (availableCharacterCount < remaining) {
    return Number.NEGATIVE_INFINITY;
  }

  let remainingRateUpper = 0;
  if (remaining >= 1) {
    remainingRateUpper += Math.max(0, topRate1);
  }
  if (remaining >= 2) {
    remainingRateUpper += Math.max(0, topRate2);
  }
  if (remaining >= 3) {
    remainingRateUpper += Math.max(0, topRate3);
  }
  if (remaining >= 4) {
    remainingRateUpper += Math.max(0, topRate4);
  }
  if (remaining >= 5) {
    remainingRateUpper += Math.max(0, topRate5);
  }
  return selectedRate + remainingRateUpper;
}

function estimateSearchScopePointBonusRateUpperForContext(
  selectedCards: SearchCard[],
  upperBoundIndex: CharacterUpperBoundIndex,
  cards: SearchCard[],
  startIndex: number,
  usedCharacterMaskLow: number,
  usedCharacterMaskHigh: number,
  skillContextUpperMode?: SkillContextUpperMode,
  selectedPointBonusRate?: number,
): number {
  if (skillContextUpperMode === "same-band" || skillContextUpperMode === "both") {
    return estimateSearchScopePointBonusRateUpper(
      selectedCards,
      upperBoundIndex,
      cards,
      startIndex,
      usedCharacterMaskLow,
      usedCharacterMaskHigh,
      undefined,
      selectedPointBonusRate,
    );
  }

  return estimateSearchScopePointBonusRateUpper(
    selectedCards,
    upperBoundIndex,
    cards,
    startIndex,
    usedCharacterMaskLow,
    usedCharacterMaskHigh,
    undefined,
    selectedPointBonusRate,
  );
}

export function estimateSearchScopeTargetUpperBoundFromScore(
  scoreUpperBound: number,
  selectedCards: SearchCard[],
  upperBoundIndex: CharacterUpperBoundIndex,
  cards: SearchCard[],
  startIndex: number,
  usedCharacterMaskLow: number,
  usedCharacterMaskHigh: number,
  input: BandoriTeamSearchInput,
  target: BandoriTeamSearchTarget,
  eventMode: BandoriTeamSearchEventMode,
  skillContextUpperMode?: SkillContextUpperMode,
  selectedPointBonusRate?: number,
  supportBandPointUpperBound = 0,
  objective?: SearchObjectiveAdapter,
): number {
  // Search compares a unified target upper bound: score mode uses score directly, while PT mode converts score bound into event-point bound.
  const usesPointBonus = objective?.usesPointBonus ?? (target === "eventPoint" && eventMode === "pointBonus");
  const pointBonusRateUpper = usesPointBonus
    ? estimateSearchScopePointBonusRateUpperForContext(
      selectedCards,
      upperBoundIndex,
      cards,
      startIndex,
      usedCharacterMaskLow,
      usedCharacterMaskHigh,
      skillContextUpperMode,
      selectedPointBonusRate,
    )
    : 0;
  if (objective) {
    return objective.estimateTargetUpperBound(scoreUpperBound, pointBonusRateUpper, input);
  }
  return estimateTargetUpperBoundFromScore(
    scoreUpperBound,
    pointBonusRateUpper,
    input,
    target,
    eventMode,
    supportBandPointUpperBound,
  );
}

export type CorrelatedUpperState = {
  power: number;
  skillAverageRate: number;
  skillLeaderRate: number;
  pointBonusRate: number;
  hasEligibleLeader: boolean;
};

function dominatesCorrelatedUpperState(left: CorrelatedUpperState, right: CorrelatedUpperState): boolean {
  return (!right.hasEligibleLeader || left.hasEligibleLeader)
    && left.power >= right.power
    && left.skillAverageRate >= right.skillAverageRate
    && left.skillLeaderRate >= right.skillLeaderRate
    && left.pointBonusRate >= right.pointBonusRate;
}

function addCorrelatedUpperState(states: CorrelatedUpperState[], next: CorrelatedUpperState): CorrelatedUpperState[] {
  for (const state of states) {
    if (dominatesCorrelatedUpperState(state, next)) {
      return states;
    }
  }
  return [
    ...states.filter((state) => !dominatesCorrelatedUpperState(next, state)),
    next,
  ];
}

export function shouldUseCorrelatedUpperBound(
  upperBound: number,
  thresholdResult: BandoriTeamSearchResult | undefined,
  objective: SearchObjectiveAdapter,
): boolean {
  if (!thresholdResult || upperBound < thresholdResult.targetValue) {
    return false;
  }
  if (objective.usesPointBonus) {
    return !Number.isFinite(upperBound) || upperBound <= thresholdResult.targetValue + 120;
  }
  if (!Number.isFinite(upperBound)) {
    return false;
  }
  return upperBound <= thresholdResult.targetValue * 1.08;
}

export function estimateCorrelatedSearchScopeTargetUpperBound(
  selectedCards: SearchCard[],
  upperBoundIndex: CharacterUpperBoundIndex,
  searchCards: SearchCard[],
  startIndex: number,
  usedCharacterMaskLow: number,
  usedCharacterMaskHigh: number,
  baseScoreRatePerPower: number,
  input: BandoriTeamSearchInput,
  objective: SearchObjectiveAdapter,
  skillContextUpperMode: SkillContextUpperMode | undefined,
  selectedPower: number,
  selectedSkillAverageRate: number | undefined,
  selectedSkillLeaderRate: number | undefined,
  selectedPointBonusRate: number,
  minLeaderScoreUpPercent: number | null = null,
): number | null {
  // The normal bound maximizes power, skill, and point bonus separately, which can combine mutually exclusive cards.
  // This small skyline DP preserves those correlations near the threshold; if it exceeds budget, return null rather than risk pruning.
  if (!skillContextUpperMode) {
    return null;
  }

  const remaining = 5 - selectedCards.length;
  const hasLeaderConstraint = minLeaderScoreUpPercent !== null;
  let selectedEligibleLeaderRate = 0;
  let selectedHasEligibleLeader = !hasLeaderConstraint;
  if (hasLeaderConstraint) {
    for (const card of selectedCards) {
      if (getCardLeaderScoreUpPercentForUpperMode(card, skillContextUpperMode) < minLeaderScoreUpPercent) {
        continue;
      }
      selectedHasEligibleLeader = true;
      selectedEligibleLeaderRate = Math.max(
        selectedEligibleLeaderRate,
        getCardSkillLeaderRateForUpperMode(card, skillContextUpperMode),
      );
    }
  }
  const selectedState: CorrelatedUpperState = {
    power: selectedPower,
    skillAverageRate: selectedSkillAverageRate ?? sumSelectedSkillAverageRateForUpperMode(selectedCards, skillContextUpperMode),
    skillLeaderRate: hasLeaderConstraint
      ? selectedEligibleLeaderRate
      : selectedSkillLeaderRate ?? maxSelectedSkillLeaderRateForUpperMode(selectedCards, skillContextUpperMode),
    pointBonusRate: selectedPointBonusRate,
    hasEligibleLeader: selectedHasEligibleLeader,
  };
  if (remaining === 0) {
    if (!selectedState.hasEligibleLeader) {
      return Number.NEGATIVE_INFINITY;
    }
    const scoreUpperBound = Math.floor(selectedState.power) * (
      baseScoreRatePerPower + selectedState.skillAverageRate + selectedState.skillLeaderRate
    );
    return objective.estimateTargetUpperBound(
      scoreUpperBound,
      selectedState.pointBonusRate,
      input,
      selectedState.power > 0 ? scoreUpperBound / selectedState.power : undefined,
    );
  }

  const boundedStartIndex = clamp(startIndex, 0, searchCards.length);
  const powerByCharacter = upperBoundIndex.powerByStartIndex[boundedStartIndex];
  const skillAverageRateByCharacter = getSkillAverageRateUpperArray(upperBoundIndex, boundedStartIndex, skillContextUpperMode);
  const skillLeaderRateByCharacter = getSkillLeaderRateUpperArray(upperBoundIndex, boundedStartIndex, skillContextUpperMode);
  const leaderScoreUpPercentByCharacter = hasLeaderConstraint
    ? getLeaderScoreUpPercentUpperArray(upperBoundIndex, boundedStartIndex, skillContextUpperMode)
    : null;
  const pointBonusRateByCharacter = upperBoundIndex.pointBonusRateByStartIndex[boundedStartIndex];
  const statesByCount: CorrelatedUpperState[][] = Array.from({ length: remaining + 1 }, () => []);
  statesByCount[0] = [selectedState];
  let availableCharacterCount = 0;
  let processedStateCount = 0;
  const stateBudget = 20000;

  for (let characterIndex = 0; characterIndex < upperBoundIndex.characterIds.length; characterIndex += 1) {
    if (hasCharacterIndexInMask(usedCharacterMaskLow, usedCharacterMaskHigh, characterIndex)) {
      continue;
    }
    const power = powerByCharacter[characterIndex] ?? 0;
    if (power <= 0) {
      continue;
    }
    availableCharacterCount += 1;
    const characterHasEligibleLeader = !hasLeaderConstraint
      || (leaderScoreUpPercentByCharacter?.[characterIndex] ?? 0) >= minLeaderScoreUpPercent;
    const characterState: CorrelatedUpperState = {
      power,
      skillAverageRate: skillAverageRateByCharacter[characterIndex] ?? 0,
      skillLeaderRate: characterHasEligibleLeader ? skillLeaderRateByCharacter[characterIndex] ?? 0 : 0,
      pointBonusRate: Math.max(0, pointBonusRateByCharacter[characterIndex] ?? 0),
      hasEligibleLeader: characterHasEligibleLeader,
    };
    const upperCount = Math.min(remaining - 1, availableCharacterCount - 1);
    for (let count = upperCount; count >= 0; count -= 1) {
      const states = statesByCount[count];
      if (states.length === 0) {
        continue;
      }
      for (const state of states) {
        processedStateCount += 1;
        if (processedStateCount > stateBudget) {
          return null;
        }
        const next: CorrelatedUpperState = {
          power: state.power + characterState.power,
          skillAverageRate: state.skillAverageRate + characterState.skillAverageRate,
          skillLeaderRate: Math.max(state.skillLeaderRate, characterState.skillLeaderRate),
          pointBonusRate: state.pointBonusRate + characterState.pointBonusRate,
          hasEligibleLeader: state.hasEligibleLeader || characterState.hasEligibleLeader,
        };
        statesByCount[count + 1] = addCorrelatedUpperState(statesByCount[count + 1], next);
      }
    }
  }

  if (availableCharacterCount < remaining) {
    return Number.NEGATIVE_INFINITY;
  }

  let targetUpperBound = Number.NEGATIVE_INFINITY;
  for (const state of statesByCount[remaining]) {
    if (!state.hasEligibleLeader) {
      continue;
    }
    const scoreUpperBound = Math.floor(state.power) * (
      baseScoreRatePerPower + state.skillAverageRate + state.skillLeaderRate
    );
    targetUpperBound = Math.max(
      targetUpperBound,
      objective.estimateTargetUpperBound(
        scoreUpperBound,
        state.pointBonusRate,
        input,
        state.power > 0 ? scoreUpperBound / state.power : undefined,
      ),
    );
  }

  return targetUpperBound;
}

export function pruneCardsByInclusionTargetUpperBound(
  cards: SearchCard[],
  upperBoundIndex: CharacterUpperBoundIndex,
  baseScoreRatePerPower: number,
  thresholdResult: BandoriTeamSearchResult | undefined,
  input: BandoriTeamSearchInput,
  target: BandoriTeamSearchTarget,
  eventMode: BandoriTeamSearchEventMode,
  skillContextUpperMode?: SkillContextUpperMode,
  supportBandPointUpperBound = 0,
  objective?: SearchObjectiveAdapter,
): SearchCard[] {
  // For each card, ask whether forcing it into the team can still beat the current Nth result in theory.
  // Remove only cards that cannot; roll back if the result no longer has 5 distinct characters.
  if (cards.length <= 5 || !thresholdResult || !Number.isFinite(thresholdResult.targetValue)) {
    return cards;
  }

  const result: SearchCard[] = [];
  for (const card of cards) {
    const characterIndex = upperBoundIndex.characterIndexById.get(card.characterId);
    if (characterIndex === undefined) {
      continue;
    }
    const usedCharacterMaskLow = characterIndex < CHARACTER_MASK_SEGMENT_BITS
      ? 1 << characterIndex
      : 0;
    const usedCharacterMaskHigh = characterIndex >= CHARACTER_MASK_SEGMENT_BITS
      ? 1 << (characterIndex - CHARACTER_MASK_SEGMENT_BITS)
      : 0;
    const scoreUpperBound = estimateSearchScopeScoreUpperBound(
      [card],
      upperBoundIndex,
      cards,
      0,
      usedCharacterMaskLow,
      usedCharacterMaskHigh,
      baseScoreRatePerPower,
      skillContextUpperMode,
      card.effectivePower,
      skillContextUpperMode ? getCardSkillAverageRateForUpperMode(card, skillContextUpperMode) : undefined,
      skillContextUpperMode ? getCardSkillLeaderRateForUpperMode(card, skillContextUpperMode) : undefined,
    );
    const targetUpperBound = estimateSearchScopeTargetUpperBoundFromScore(
      scoreUpperBound,
      [card],
      upperBoundIndex,
      cards,
      0,
      usedCharacterMaskLow,
      usedCharacterMaskHigh,
      input,
      target,
      eventMode,
      skillContextUpperMode,
      card.pointBonusRate,
      supportBandPointUpperBound,
      objective,
    );
    if (!isSearchUpperBoundBelowResultThreshold(targetUpperBound, scoreUpperBound, thresholdResult)) {
      result.push(card);
    }
  }

  return hasAtLeastDistinctCharacters(result, 5) ? result : cards;
}
