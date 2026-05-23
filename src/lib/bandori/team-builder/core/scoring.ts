/*
 * Chart score calculation shared by single-song and medley team search.
 *
 * This module owns note-level score math, skill-window optimization, combo carryover, and
 * skill-rate upper estimates. It does not choose teams; callers provide the card set and order.
 */
import type {
  BandoriJudge,
  BestdoriSkillMaster,
  ResolvedBandoriScoreSkillEffect,
  ResolvedBandoriSkill,
} from "@/lib/bandori-team-calculator";
import { JUDGE_PERCENT, JUDGE_RANK } from "./constants";
import { getScoreComboMultiplier } from "./chart";
import { buildPermutations, clamp, getRegionalNumber } from "./utils";
import type { BandoriTeamSearchInput, BandoriTeamSearchSkillOrderActor, PreparedChart, ScoreCalculationCache, ScoreComboOptions, SearchCard, SkillUpperRates } from "./types";

const SKILL_ORDER_PERMUTATIONS = buildPermutations([0, 1, 2, 3, 4]);
function getSkillEndNote(chart: PreparedChart, slotIndex: number, durationSeconds: number): number {
  const triggerTime = chart.skillTriggerTimes[slotIndex];
  if (triggerTime === undefined) {
    return chart.notesCount;
  }

  const endTime = triggerTime + durationSeconds + 0.00001;
  let low = 0;
  let high = chart.notesCount;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((chart.notes[middle]?.time ?? 0) > endTime) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return low;
}

// This perfectRate path is an expected-score model: all non-PERFECT notes are treated as GREAT.
// Paths that need an explicit judgment sequence use judgeList instead of this expected multiplier.
function conditionMatches(effect: ResolvedBandoriScoreSkillEffect, judge: BandoriJudge): boolean {
  return effect.condition === "none" || JUDGE_RANK[judge] <= JUDGE_RANK[effect.condition];
}

function isGoodOrWorseJudge(judge: BandoriJudge): boolean {
  return JUDGE_RANK[judge] > JUDGE_RANK.great;
}

function getExpectedJudgePercent(perfectRate: number): number {
  const normalizedPerfectRate = clamp(perfectRate, 0, 1);
  return JUDGE_PERCENT.perfect * normalizedPerfectRate + JUDGE_PERCENT.great * (1 - normalizedPerfectRate);
}

// The current accuracy model treats non-PERFECT notes as GREAT, so GREAT-or-worse breaks do not trigger on the expected-score path.
function getEffectMultiplier(
  effect: ResolvedBandoriScoreSkillEffect,
  judge: BandoriJudge,
  continuedActive: boolean,
  rateUpBonusPercent: number,
): { multiplier: number; continuedActive: boolean } {
  if (effect.type === "score_rate_up_with_perfect") {
    return { multiplier: 1, continuedActive };
  }

  if (effect.type === "score_continued_note_judge") {
    const nextContinuedActive = continuedActive && !isGoodOrWorseJudge(judge);
    return {
      multiplier: nextContinuedActive ? 1 + (effect.valuePercent + rateUpBonusPercent) / 100 : 1,
      continuedActive: nextContinuedActive,
    };
  }

  if (effect.type === "score_under_great_half") {
    if (conditionMatches(effect, judge)) {
      return {
        multiplier: 1 + (effect.valuePercent + rateUpBonusPercent) / 100,
        continuedActive,
      };
    }
    return {
      multiplier: isGoodOrWorseJudge(judge) ? 0.5 : 1,
      continuedActive,
    };
  }

  if (effect.type === "score_only_perfect") {
    return {
      multiplier: judge === "perfect" && conditionMatches(effect, judge)
        ? 1 + (effect.valuePercent + rateUpBonusPercent) / 100
        : 0,
      continuedActive,
    };
  }

  if (conditionMatches(effect, judge)) {
    return {
      multiplier: 1 + (effect.valuePercent + rateUpBonusPercent) / 100,
      continuedActive,
    };
  }

  return { multiplier: 1, continuedActive };
}

function hasContinuedJudgeEffect(skill: ResolvedBandoriSkill): boolean {
  return skill.scoreEffects.some((effect) => effect.type === "score_continued_note_judge");
}

function getExpectedSkillMultiplier(
  skill: ResolvedBandoriSkill,
  perfectRate: number,
  activeNoteCount: number,
): number {
  const normalizedPerfectRate = clamp(perfectRate, 0, 1);
  const expectedJudgePercent = getExpectedJudgePercent(normalizedPerfectRate);
  let continuedMultiplier = 0;
  let perfectBonus = 0;
  let greatBonus = 0;
  let scoringEffectApplied = false;

  for (const effect of skill.scoreEffects) {
    if (effect.type === "score_rate_up_with_perfect") {
      continue;
    }

    const rateUpBonusPercent = skill.hasRateUpWithPerfect
      ? 0.5 * Math.min(activeNoteCount, 100) * normalizedPerfectRate
      : 0;
    const valueBonus = (effect.valuePercent + rateUpBonusPercent) / 100;

    if (effect.type === "score_continued_note_judge") {
      continuedMultiplier = 1 + valueBonus;
      scoringEffectApplied = true;
    } else if (effect.type === "score_under_great_half") {
      perfectBonus = valueBonus;
      greatBonus = -0.5;
      scoringEffectApplied = true;
    } else if (effect.type === "score_only_perfect" || effect.condition === "perfect") {
      if (perfectBonus === 0) {
        perfectBonus = valueBonus;
      }
      scoringEffectApplied = true;
    } else {
      if (perfectBonus === 0) {
        perfectBonus = valueBonus;
      }
      if (greatBonus === 0) {
        greatBonus = valueBonus;
      }
      scoringEffectApplied = true;
    }
  }

  if (!scoringEffectApplied) {
    return 1;
  }

  const perfectMultiplier = 1 + perfectBonus;
  const greatMultiplier = 1 + greatBonus;
  if (continuedMultiplier > 0) {
    return greatMultiplier
      + (normalizedPerfectRate ** activeNoteCount) * (continuedMultiplier - greatMultiplier);
  }
  if (perfectMultiplier === greatMultiplier) {
    return perfectMultiplier;
  }
  return (
    JUDGE_PERCENT.perfect * perfectMultiplier * normalizedPerfectRate
    + JUDGE_PERCENT.great * greatMultiplier * (1 - normalizedPerfectRate)
  ) / expectedJudgePercent;
}

function buildSkillMultiplierList(
  chart: PreparedChart,
  skill: ResolvedBandoriSkill | null,
  slotIndex: number,
  perfectRate: number,
): Float64Array {
  const result = new Float64Array(chart.notesCount);
  result.fill(1);
  if (!skill || skill.scoreEffects.length === 0) {
    return result;
  }

  const start = chart.skillStartNotes[slotIndex] ?? chart.notesCount;
  const end = getSkillEndNote(chart, slotIndex, skill.durationSeconds);

  for (let noteIndex = start; noteIndex < end; noteIndex += 1) {
    result[noteIndex] = getExpectedSkillMultiplier(skill, perfectRate, noteIndex - start + 1);
  }

  return result;
}

function getSkillMultiplierForJudge(skill: ResolvedBandoriSkill, judge: BandoriJudge): number {
  let multiplier = 1;
  let continuedActive = true;
  for (const effect of skill.scoreEffects) {
    const next = getEffectMultiplier(effect, judge, continuedActive, 0);
    continuedActive = next.continuedActive;
    multiplier = Math.max(multiplier, next.multiplier);
  }
  return Math.max(0, multiplier);
}

// Some skill effects collapse to a constant multiplier for a given accuracy, avoiding per-note multiplier arrays.
function getGeneratedJudgeConstantSkillMultiplier(
  skill: ResolvedBandoriSkill,
  perfectRate: number,
): number {
  if (skill.hasRateUpWithPerfect) {
    return Number.NaN;
  }

  const perfectMultiplier = getSkillMultiplierForJudge(skill, "perfect");
  if (perfectRate === 1) {
    return perfectMultiplier;
  }

  if (hasContinuedJudgeEffect(skill)) {
    return Number.NaN;
  }

  return getExpectedSkillMultiplier(skill, perfectRate, 1);
}

function getCachedSkillMultiplierList(
  chart: PreparedChart,
  skill: ResolvedBandoriSkill | null,
  slotIndex: number,
  perfectRate: number,
  cache?: ScoreCalculationCache,
): Float64Array {
  if (!cache || !skill) {
    return buildSkillMultiplierList(chart, skill, slotIndex, perfectRate);
  }

  const key = `${perfectRate}:${slotIndex}:${skill.cacheKey}`;
  const cached = cache.skillMultiplierLists.get(key);
  if (cached) {
    return cached;
  }

  const multipliers = buildSkillMultiplierList(chart, skill, slotIndex, perfectRate);
  cache.skillMultiplierLists.set(key, multipliers);
  return multipliers;
}

function buildJudgeList(notesCount: number, perfectRate: number): BandoriJudge[] {
  const normalizedPerfectRate = clamp(perfectRate, 0, 1);
  const perfectCount = Math.round(notesCount * normalizedPerfectRate);
  return Array.from({ length: notesCount }, (_, index) => (index < perfectCount ? "perfect" : "great"));
}

function getCachedJudgeList(
  notesCount: number,
  perfectRate: number,
  cache?: ScoreCalculationCache,
): BandoriJudge[] {
  if (!cache?.judgeLists) {
    return buildJudgeList(notesCount, perfectRate);
  }
  const key = `${notesCount}:${perfectRate}`;
  const cached = cache.judgeLists.get(key);
  if (cached) {
    return cached;
  }
  const judgeList = buildJudgeList(notesCount, perfectRate);
  cache.judgeLists.set(key, judgeList);
  return judgeList;
}

type InnerScoreResult = {
  scores: Int32Array;
  total: number;
};

function getCachedInnerScoreRates(
  chart: PreparedChart,
  judgeList: readonly BandoriJudge[],
  perfectRate: number,
  comboOptions: ScoreComboOptions | undefined,
  cache?: ScoreCalculationCache,
): Float64Array {
  const cacheKey = [
    chart.notesCount,
    chart.playLevel,
    perfectRate,
    comboOptions?.startCombo ?? 0,
    comboOptions?.useMedleyCombo ? 1 : 0,
  ].join(":");
  const cached = cache?.innerScoreRates?.get(cacheKey);
  if (cached) {
    return cached;
  }

  const rates = new Float64Array(chart.notesCount);
  const baseScorePerPower = 3 * (1 + (chart.playLevel - 5) / 100) / chart.notesCount;
  const judgePercent = getExpectedJudgePercent(perfectRate);
  for (let noteIndex = 0; noteIndex < chart.notesCount; noteIndex += 1) {
    const note = chart.notes[noteIndex];
    rates[noteIndex] = baseScorePerPower
      * judgePercent
      * getScoreComboMultiplier(noteIndex, comboOptions)
      * (note.fever ? 2 : 1);
  }
  cache?.innerScoreRates?.set(cacheKey, rates);
  return rates;
}

function buildInnerScoreResult(
  chart: PreparedChart,
  bandPower: number,
  judgeList: readonly BandoriJudge[],
  perfectRate: number,
  comboOptions?: ScoreComboOptions,
  cache?: ScoreCalculationCache,
): InnerScoreResult {
  const scores = new Int32Array(chart.notesCount);
  if (chart.notesCount === 0 || bandPower <= 0) {
    return { scores, total: 0 };
  }

  const innerScoreRates = getCachedInnerScoreRates(chart, judgeList, perfectRate, comboOptions, cache);
  let total = 0;
  for (let noteIndex = 0; noteIndex < chart.notesCount; noteIndex += 1) {
    const score = Math.floor(bandPower * innerScoreRates[noteIndex]);
    scores[noteIndex] = score;
    total += score;
  }
  return { scores, total };
}

// Computes note scores before skills. Complex skill paths reuse each note's inner score to calculate window deltas.
function calculateBaseScoreFromRates(bandPower: number, innerScoreRates: Float64Array): number {
  let total = 0;
  for (let noteIndex = 0; noteIndex < innerScoreRates.length; noteIndex += 1) {
    total += Math.floor(bandPower * innerScoreRates[noteIndex]);
  }
  return total;
}

function calculateConstantWindowContributionsFromRates(
  chart: PreparedChart,
  skill: ResolvedBandoriSkill,
  constantMultiplier: number,
  bandPower: number,
  innerScoreRates: Float64Array,
  cache: Map<string, Int32Array>,
): Int32Array {
  const cacheKey = `${constantMultiplier}:${skill.durationSeconds}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const windowContributions = new Int32Array(6);
  for (let slotIndex = 0; slotIndex < 6; slotIndex += 1) {
    const start = chart.skillStartNotes[slotIndex] ?? chart.notesCount;
    const end = getSkillEndNote(chart, slotIndex, skill.durationSeconds);
    let contribution = 0;
    for (let noteIndex = start; noteIndex < end; noteIndex += 1) {
      const innerScore = Math.floor(bandPower * innerScoreRates[noteIndex]);
      contribution += Math.floor(innerScore * constantMultiplier) - innerScore;
    }
    windowContributions[slotIndex] = contribution;
  }
  cache.set(cacheKey, windowContributions);
  return windowContributions;
}

function calculateSkillExtraContribution(
  chart: PreparedChart,
  skill: ResolvedBandoriSkill | null,
  slotIndex: number,
  judgeList: readonly BandoriJudge[],
  innerScores: Int32Array,
  perfectRate: number,
  cache?: ScoreCalculationCache,
  constantWindowContributionCache?: Map<string, Int32Array>,
): number {
  if (!skill || skill.scoreEffects.length === 0) {
    return 0;
  }

  let contribution = 0;
  const start = chart.skillStartNotes[slotIndex] ?? chart.notesCount;
  const end = getSkillEndNote(chart, slotIndex, skill.durationSeconds);
  const constantMultiplier = getGeneratedJudgeConstantSkillMultiplier(skill, perfectRate);
  if (Number.isFinite(constantMultiplier)) {
    if (constantWindowContributionCache) {
      const cacheKey = `${constantMultiplier}:${skill.durationSeconds}`;
      let windowContributions = constantWindowContributionCache.get(cacheKey);
      if (!windowContributions) {
        windowContributions = new Int32Array(6);
        for (let cachedSlotIndex = 0; cachedSlotIndex < 6; cachedSlotIndex += 1) {
          const cachedStart = chart.skillStartNotes[cachedSlotIndex] ?? chart.notesCount;
          const cachedEnd = getSkillEndNote(chart, cachedSlotIndex, skill.durationSeconds);
          let windowContribution = 0;
          for (let noteIndex = cachedStart; noteIndex < cachedEnd; noteIndex += 1) {
            windowContribution += Math.floor(innerScores[noteIndex] * constantMultiplier) - innerScores[noteIndex];
          }
          windowContributions[cachedSlotIndex] = windowContribution;
        }
        constantWindowContributionCache.set(cacheKey, windowContributions);
      }
      return windowContributions[slotIndex] ?? 0;
    }
    for (let noteIndex = start; noteIndex < end; noteIndex += 1) {
      contribution += Math.floor(innerScores[noteIndex] * constantMultiplier) - innerScores[noteIndex];
    }
    return contribution;
  }

  const multipliers = getCachedSkillMultiplierList(chart, skill, slotIndex, perfectRate, cache);
  for (let noteIndex = start; noteIndex < end; noteIndex += 1) {
    contribution += Math.floor(innerScores[noteIndex] * Math.max(0, multipliers[noteIndex])) - innerScores[noteIndex];
  }
  return contribution;
}

export type SkillWindowScoreResult = {
  score: number;
  averageScore: number;
  rawAverageScore?: number;
  minScore: number;
  maxScoreOrderCount: number;
  maxScoreOrderTotal: number;
  leaderIndex: number;
  permutation: number[];
  skillOrderCardIds?: number[];
  skillOrderActors?: BandoriTeamSearchSkillOrderActor[];
  roomScoreRatePerPower?: number;
};

type SkillAssignmentOptimization = {
  maxScore: number;
  minScore: number;
  maxOrderCount: number;
  permutation: number[];
};

const SKILL_ASSIGNMENT_SIZE = 5;
const SKILL_ASSIGNMENT_STATE_COUNT = 1 << SKILL_ASSIGNMENT_SIZE;
const SKILL_ASSIGNMENT_FULL_MASK = SKILL_ASSIGNMENT_STATE_COUNT - 1;

// When skill windows do not overlap, bitmask DP is exactly equivalent to enumerating all 5! skill-window assignments.
const SKILL_ASSIGNMENT_SLOT_BY_MASK = Array.from(
  { length: SKILL_ASSIGNMENT_STATE_COUNT },
  (_, mask) => {
    let count = 0;
    let remaining = mask;
    while (remaining > 0) {
      remaining &= remaining - 1;
      count += 1;
    }
    return count;
  },
);
const SKILL_ASSIGNMENT_TRANSITIONS = Array.from(
  { length: SKILL_ASSIGNMENT_STATE_COUNT },
  (_, mask) => {
    const transitions: Array<[number, number]> = [];
    for (let skillIndex = 0; skillIndex < SKILL_ASSIGNMENT_SIZE; skillIndex += 1) {
      const skillBit = 1 << skillIndex;
      if ((mask & skillBit) === 0) {
        transitions.push([skillIndex, mask | skillBit]);
      }
    }
    return transitions;
  },
);

function decodeSkillPermutationCode(code: number): number[] {
  const permutation = new Array<number>(SKILL_ASSIGNMENT_SIZE);
  let remaining = code;
  for (let index = SKILL_ASSIGNMENT_SIZE - 1; index >= 0; index -= 1) {
    permutation[index] = remaining % SKILL_ASSIGNMENT_SIZE;
    remaining = Math.trunc(remaining / SKILL_ASSIGNMENT_SIZE);
  }
  return permutation;
}

function optimizeSkillAssignment(contributions: number[][]): SkillAssignmentOptimization {
  // mask is the set of already assigned skills; slotIndex is derived from the assigned-skill count.
  // On ties, keep the lexicographically smaller permutation so results stay stable.
  const maxScores = new Float64Array(SKILL_ASSIGNMENT_STATE_COUNT);
  const minScores = new Float64Array(SKILL_ASSIGNMENT_STATE_COUNT);
  const maxOrderCounts = new Int16Array(SKILL_ASSIGNMENT_STATE_COUNT);
  const maxPermutationCodes = new Int32Array(SKILL_ASSIGNMENT_STATE_COUNT);
  maxScores.fill(Number.NEGATIVE_INFINITY);
  minScores.fill(Number.POSITIVE_INFINITY);
  maxPermutationCodes.fill(Number.MAX_SAFE_INTEGER);
  maxScores[0] = 0;
  minScores[0] = 0;
  maxOrderCounts[0] = 1;
  maxPermutationCodes[0] = 0;

  for (let mask = 0; mask < SKILL_ASSIGNMENT_FULL_MASK; mask += 1) {
    const slotIndex = SKILL_ASSIGNMENT_SLOT_BY_MASK[mask];
    if (slotIndex >= SKILL_ASSIGNMENT_SIZE) {
      continue;
    }
    const currentMaxScore = maxScores[mask];
    const currentMinScore = minScores[mask];
    const currentPermutationCode = maxPermutationCodes[mask];
    for (const [skillIndex, nextMask] of SKILL_ASSIGNMENT_TRANSITIONS[mask]) {
      const contribution = contributions[skillIndex][slotIndex];
      const nextMaxScore = currentMaxScore + contribution;
      const nextMinScore = currentMinScore + contribution;
      if (nextMaxScore > maxScores[nextMask]) {
        maxScores[nextMask] = nextMaxScore;
        maxOrderCounts[nextMask] = maxOrderCounts[mask];
        maxPermutationCodes[nextMask] = currentPermutationCode * SKILL_ASSIGNMENT_SIZE + skillIndex;
      } else if (nextMaxScore === maxScores[nextMask]) {
        maxOrderCounts[nextMask] += maxOrderCounts[mask];
        const nextPermutationCode = currentPermutationCode * SKILL_ASSIGNMENT_SIZE + skillIndex;
        if (nextPermutationCode < maxPermutationCodes[nextMask]) {
          maxPermutationCodes[nextMask] = nextPermutationCode;
        }
      }
      if (nextMinScore < minScores[nextMask]) {
        minScores[nextMask] = nextMinScore;
      }
    }
  }

  return {
    maxScore: maxScores[SKILL_ASSIGNMENT_FULL_MASK],
    minScore: minScores[SKILL_ASSIGNMENT_FULL_MASK],
    maxOrderCount: maxOrderCounts[SKILL_ASSIGNMENT_FULL_MASK],
    permutation: decodeSkillPermutationCode(maxPermutationCodes[SKILL_ASSIGNMENT_FULL_MASK]),
  };
}

function calculateNoFloorBaseScoreRatePerPower(
  chart: PreparedChart,
  perfectRate: number,
  comboOptions?: ScoreComboOptions,
): number {
  if (chart.notesCount === 0) {
    return 0;
  }

  const normalizedPerfectRate = clamp(perfectRate, 0, 1);
  const judgeRate = JUDGE_PERCENT.perfect * normalizedPerfectRate + JUDGE_PERCENT.great * (1 - normalizedPerfectRate);
  const baseScorePerPower = 3 * (1 + (chart.playLevel - 5) / 100) / chart.notesCount;
  return chart.notes.reduce((sum, note, index) => (
    sum + baseScorePerPower * judgeRate * getScoreComboMultiplier(index, comboOptions) * (note.fever ? 2 : 1)
  ), 0);
}

function getCachedNoFloorBaseScoreRatePerPower(
  chart: PreparedChart,
  perfectRate: number,
  comboOptions: ScoreComboOptions | undefined,
  cache: ScoreCalculationCache | undefined,
): number {
  if (!cache?.noFloorBaseScoreRates) {
    return calculateNoFloorBaseScoreRatePerPower(chart, perfectRate, comboOptions);
  }
  const cacheKey = [
    chart.notesCount,
    chart.playLevel,
    perfectRate,
    comboOptions?.startCombo ?? 0,
    comboOptions?.useMedleyCombo ? 1 : 0,
  ].join(":");
  const cached = cache.noFloorBaseScoreRates.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const rate = calculateNoFloorBaseScoreRatePerPower(chart, perfectRate, comboOptions);
  cache.noFloorBaseScoreRates.set(cacheKey, rate);
  return rate;
}

function calculateResolvedSkillNoFloorRatesPerPower(
  chart: PreparedChart,
  skill: ResolvedBandoriSkill | null,
  perfectRate: number,
  comboOptions?: ScoreComboOptions,
): SkillUpperRates {
  if (!skill || skill.scoreEffects.length === 0 || chart.notesCount === 0) {
    return {
      maxRate: 0,
      averageRate: 0,
      leaderRate: 0,
    };
  }

  const judgePercent = getExpectedJudgePercent(perfectRate);
  const baseScorePerPower = 3 * (1 + (chart.playLevel - 5) / 100) / chart.notesCount;
  const constantMultiplier = getGeneratedJudgeConstantSkillMultiplier(skill, perfectRate);
  let bestWindowRate = 0;
  let triggerWindowRateSum = 0;
  let leaderWindowRate = 0;

  for (let slotIndex = 0; slotIndex < 6; slotIndex += 1) {
    const start = chart.skillStartNotes[slotIndex] ?? chart.notesCount;
    const end = getSkillEndNote(chart, slotIndex, skill.durationSeconds);
    const multipliers = Number.isFinite(constantMultiplier)
      ? null
      : buildSkillMultiplierList(chart, skill, slotIndex, perfectRate);
    let windowRate = 0;
    for (let noteIndex = start; noteIndex < end; noteIndex += 1) {
      const note = chart.notes[noteIndex];
      const multiplier = multipliers?.[noteIndex] ?? constantMultiplier;
      windowRate += baseScorePerPower
        * judgePercent
        * getScoreComboMultiplier(noteIndex, comboOptions)
        * (note.fever ? 2 : 1)
        * Math.max(0, multiplier - 1);
    }
    bestWindowRate = Math.max(bestWindowRate, windowRate);
    if (slotIndex < 5) {
      triggerWindowRateSum += windowRate;
    } else {
      leaderWindowRate = windowRate;
    }
  }

  return {
    maxRate: bestWindowRate,
    averageRate: triggerWindowRateSum / 5,
    leaderRate: leaderWindowRate,
  };
}

function getCachedResolvedSkillNoFloorRatesPerPower(
  chart: PreparedChart,
  skill: ResolvedBandoriSkill | null,
  perfectRate: number,
  comboOptions: ScoreComboOptions | undefined,
  cache: ScoreCalculationCache | undefined,
): SkillUpperRates {
  if (!skill || !cache) {
    return calculateResolvedSkillNoFloorRatesPerPower(chart, skill, perfectRate, comboOptions);
  }

  const cacheKey = [
    perfectRate,
    comboOptions?.startCombo ?? 0,
    comboOptions?.useMedleyCombo ? 1 : 0,
    skill.cacheKey,
  ].join(":");
  const cached = cache.noFloorSkillRates.get(cacheKey);
  if (cached) {
    return cached;
  }

  const rates = calculateResolvedSkillNoFloorRatesPerPower(chart, skill, perfectRate, comboOptions);
  cache.noFloorSkillRates.set(cacheKey, rates);
  return rates;
}

export function calculateBestMultiLiveScoreForSkillWindows(
  chart: PreparedChart,
  bandPower: number,
  selfSkills: Array<ResolvedBandoriSkill | null>,
  otherSkills: Array<ResolvedBandoriSkill | null>,
  encoreSkillSource: BandoriTeamSearchInput["encoreSkillSource"],
  cards: SearchCard[],
  perfectRate: number,
  cache?: ScoreCalculationCache,
  comboOptions?: ScoreComboOptions,
  targetOnly = false,
  shouldCalculateDetailed?: (targetOnlyResult: SkillWindowScoreResult) => boolean,
): SkillWindowScoreResult {
  // In multi live, the leader skill and other-player skills share the first 5 trigger windows; the 6th window is chosen by encore source.
  // Calculate averageScore first as the search target, then fill max/min and skill-order details only if the team can still enter top-N.
  const judgeList = getCachedJudgeList(chart.notesCount, perfectRate, cache);
  const relevantSkills = [...selfSkills, ...otherSkills.slice(0, 4)];
  const canUseConstantOnlyScoring = relevantSkills.every((skill) => (
    !skill || Number.isFinite(getGeneratedJudgeConstantSkillMultiplier(skill, perfectRate))
  ));
  const innerScoreRates = canUseConstantOnlyScoring
    ? getCachedInnerScoreRates(chart, judgeList, perfectRate, comboOptions, cache)
    : null;
  const innerScoreResult = innerScoreRates
    ? null
    : buildInnerScoreResult(chart, bandPower, judgeList, perfectRate, comboOptions, cache);
  const innerScores = innerScoreResult?.scores ?? null;
  const baseScore = innerScoreRates
    ? calculateBaseScoreFromRates(bandPower, innerScoreRates)
    : innerScoreResult?.total ?? 0;
  const zeroContributions = [0, 0, 0, 0, 0, 0];
  const contributionCache = new Map<string, number[]>();
  const constantWindowContributionCache = new Map<string, Int32Array>();
  const getContributions = (skill: ResolvedBandoriSkill | null | undefined): number[] => {
    if (!skill) {
      return zeroContributions;
    }
    const cached = contributionCache.get(skill.cacheKey);
    if (cached) {
      return cached;
    }
    const constantMultiplier = getGeneratedJudgeConstantSkillMultiplier(skill, perfectRate);
    if (innerScoreRates && Number.isFinite(constantMultiplier)) {
      const windowContributions = calculateConstantWindowContributionsFromRates(
        chart,
        skill,
        constantMultiplier,
        bandPower,
        innerScoreRates,
        constantWindowContributionCache,
      );
      const contributions = Array.from(windowContributions);
      contributionCache.set(skill.cacheKey, contributions);
      return contributions;
    }
    if (!innerScores) {
      return zeroContributions;
    }
    const contributions = Array.from({ length: 6 }, (_, slotIndex) => (
      calculateSkillExtraContribution(
        chart,
        skill,
        slotIndex,
        judgeList,
        innerScores,
        perfectRate,
        cache,
        constantWindowContributionCache,
      )
    ));
    contributionCache.set(skill.cacheKey, contributions);
    return contributions;
  };
  const selfContributions = selfSkills.map((skill) => getContributions(skill));
  const otherContributions = otherSkills.slice(0, 4).map((skill) => getContributions(skill));
  while (otherContributions.length < 4) {
    otherContributions.push(zeroContributions);
  }
  const otherTriggerContributionAverage = otherContributions.reduce((sum, contribution) => (
    sum + (contribution[0] + contribution[1] + contribution[2] + contribution[3] + contribution[4]) / 5
  ), 0);
  // Estimate other-player score with no-floor score per power, avoiding magnified error from a floored own-score ratio.
  const noFloorBaseScoreRate = getCachedNoFloorBaseScoreRatePerPower(chart, perfectRate, comboOptions, cache);
  const selfNoFloorRates = selfSkills.map((skill) => getCachedResolvedSkillNoFloorRatesPerPower(
    chart,
    skill,
    perfectRate,
    comboOptions,
    cache,
  ));
  const otherNoFloorRates = otherSkills.slice(0, 4).map((skill) => getCachedResolvedSkillNoFloorRatesPerPower(
    chart,
    skill,
    perfectRate,
    comboOptions,
    cache,
  ));
  while (otherNoFloorRates.length < 4) {
    otherNoFloorRates.push({ maxRate: 0, averageRate: 0, leaderRate: 0 });
  }
  const otherTriggerNoFloorRateAverage = otherNoFloorRates.reduce((sum, rate) => sum + rate.averageRate, 0);
  const externalEncoreIndex = encoreSkillSource?.startsWith("other")
    ? Number(encoreSkillSource.replace("other", "")) - 1
    : -1;
  let targetOnlyResult: SkillWindowScoreResult | null = null;

  for (let leaderIndex = 0; leaderIndex < selfSkills.length; leaderIndex += 1) {
    const leaderContributions = selfContributions[leaderIndex] ?? zeroContributions;
    const averageTriggerContribution = otherTriggerContributionAverage
      + (leaderContributions[0] + leaderContributions[1] + leaderContributions[2] + leaderContributions[3] + leaderContributions[4]) / 5;
    const encoreContribution = externalEncoreIndex >= 0
      ? otherContributions[externalEncoreIndex]?.[5] ?? 0
      : leaderContributions[5] ?? 0;
    const roomScoreRatePerPower = noFloorBaseScoreRate
      + otherTriggerNoFloorRateAverage
      + (selfNoFloorRates[leaderIndex]?.averageRate ?? 0)
      + (
        externalEncoreIndex >= 0
          ? otherNoFloorRates[externalEncoreIndex]?.leaderRate ?? 0
          : selfNoFloorRates[leaderIndex]?.leaderRate ?? 0
      );
    const rawAverageScore = baseScore + averageTriggerContribution + encoreContribution;
    const averageScore = Math.floor(rawAverageScore);
    const candidate: SkillWindowScoreResult = {
      score: averageScore,
      averageScore,
      rawAverageScore,
      minScore: averageScore,
      maxScoreOrderCount: 0,
      maxScoreOrderTotal: SKILL_ORDER_PERMUTATIONS.length,
      leaderIndex,
      permutation: SKILL_ORDER_PERMUTATIONS[0],
      roomScoreRatePerPower,
    };
    if (
      targetOnlyResult === null
      || candidate.averageScore > targetOnlyResult.averageScore
      || (
        candidate.averageScore === targetOnlyResult.averageScore
        && (candidate.roomScoreRatePerPower ?? 0) > (targetOnlyResult.roomScoreRatePerPower ?? 0)
      )
    ) {
      targetOnlyResult = candidate;
    }
  }

  if (
    targetOnly
    || (
      targetOnlyResult
      && shouldCalculateDetailed
      && !shouldCalculateDetailed(targetOnlyResult)
    )
  ) {
    return targetOnlyResult ?? {
      score: Number.NEGATIVE_INFINITY,
      averageScore: Number.NEGATIVE_INFINITY,
      minScore: 0,
      maxScoreOrderCount: 0,
      maxScoreOrderTotal: SKILL_ORDER_PERMUTATIONS.length,
      leaderIndex: 0,
      permutation: SKILL_ORDER_PERMUTATIONS[0],
    };
  }

  let bestResult: SkillWindowScoreResult | null = null;

  for (let leaderIndex = 0; leaderIndex < selfSkills.length; leaderIndex += 1) {
    const leaderContributions = selfContributions[leaderIndex] ?? zeroContributions;
    const triggerContributions = [
      leaderContributions,
      otherContributions[0],
      otherContributions[1],
      otherContributions[2],
      otherContributions[3],
    ];
    const averageTriggerContribution = otherTriggerContributionAverage
      + (leaderContributions[0] + leaderContributions[1] + leaderContributions[2] + leaderContributions[3] + leaderContributions[4]) / 5;
    const encoreContribution = externalEncoreIndex >= 0
      ? otherContributions[externalEncoreIndex]?.[5] ?? 0
      : leaderContributions[5] ?? 0;
    const roomScoreRatePerPower = noFloorBaseScoreRate
      + otherTriggerNoFloorRateAverage
      + (selfNoFloorRates[leaderIndex]?.averageRate ?? 0)
      + (
        externalEncoreIndex >= 0
          ? otherNoFloorRates[externalEncoreIndex]?.leaderRate ?? 0
          : selfNoFloorRates[leaderIndex]?.leaderRate ?? 0
      );
    const rawAverageScore = baseScore + averageTriggerContribution + encoreContribution;
    const averageScore = Math.floor(rawAverageScore);

    const assignment = optimizeSkillAssignment(triggerContributions);
    const result: SkillWindowScoreResult = {
      score: baseScore + assignment.maxScore + encoreContribution,
      averageScore,
      rawAverageScore,
      minScore: baseScore + assignment.minScore + encoreContribution,
      maxScoreOrderCount: assignment.maxOrderCount,
      maxScoreOrderTotal: SKILL_ORDER_PERMUTATIONS.length,
      leaderIndex,
      permutation: assignment.permutation,
      roomScoreRatePerPower,
    };
    const skillOrderCardIds = [
      ...result.permutation.map((skillIndex) => (
        skillIndex === 0 ? cards[leaderIndex].cardId : 0
      )),
      externalEncoreIndex >= 0 ? 0 : cards[leaderIndex].cardId,
    ];
    const skillOrderActors: BandoriTeamSearchSkillOrderActor[] = [
      ...result.permutation.map((skillIndex) => (
        skillIndex === 0 ? "self" : `other${skillIndex}` as BandoriTeamSearchSkillOrderActor
      )),
      externalEncoreIndex >= 0 ? `other${externalEncoreIndex + 1}` as BandoriTeamSearchSkillOrderActor : "self",
    ];
    const candidate: SkillWindowScoreResult = {
      ...result,
      leaderIndex,
      skillOrderCardIds,
      skillOrderActors,
    };

    if (
      bestResult === null
      || candidate.averageScore > bestResult.averageScore
      || (
        candidate.averageScore === bestResult.averageScore
        && candidate.score > bestResult.score
      )
    ) {
      bestResult = candidate;
    }
  }

  return bestResult ?? {
    score: Number.NEGATIVE_INFINITY,
    averageScore: Number.NEGATIVE_INFINITY,
    minScore: 0,
    maxScoreOrderCount: 0,
    maxScoreOrderTotal: SKILL_ORDER_PERMUTATIONS.length,
    leaderIndex: 0,
    permutation: SKILL_ORDER_PERMUTATIONS[0],
  };
}

export function calculateBestScoreForNonOverlappingSkillWindows(
  chart: PreparedChart,
  bandPower: number,
  skills: Array<ResolvedBandoriSkill | null>,
  perfectRate: number,
  cache?: ScoreCalculationCache,
  encoreSkill?: ResolvedBandoriSkill | null,
  comboOptions?: ScoreComboOptions,
  targetOnly = false,
  shouldCalculateDetailed?: (targetOnlyResult: SkillWindowScoreResult) => boolean,
): SkillWindowScoreResult {
  // Solo/normal scoring assumes the 5 normal skill windows do not overlap, so trigger order only maps cards onto windows.
  // When encoreSkill is defined, the 6th window is fixed to that external/leader skill.
  const judgeList = getCachedJudgeList(chart.notesCount, perfectRate, cache);
  const relevantSkills = encoreSkill === undefined ? skills : [...skills, encoreSkill];
  const canUseConstantOnlyScoring = relevantSkills.every((skill) => (
    !skill || Number.isFinite(getGeneratedJudgeConstantSkillMultiplier(skill, perfectRate))
  ));
  const innerScoreRates = canUseConstantOnlyScoring
    ? getCachedInnerScoreRates(chart, judgeList, perfectRate, comboOptions, cache)
    : null;
  const innerScoreResult = innerScoreRates
    ? null
    : buildInnerScoreResult(chart, bandPower, judgeList, perfectRate, comboOptions, cache);
  const innerScores = innerScoreResult?.scores ?? null;
  const baseScore = innerScoreRates
    ? calculateBaseScoreFromRates(bandPower, innerScoreRates)
    : innerScoreResult?.total ?? 0;

  const constantWindowContributionCache = new Map<string, Int32Array>();
  const zeroContributions = [0, 0, 0, 0, 0, 0];
  const contributionCache = new Map<string, number[]>();
  const getContributions = (skill: ResolvedBandoriSkill | null | undefined): number[] => {
    if (!skill) {
      return zeroContributions;
    }
    const cached = contributionCache.get(skill.cacheKey);
    if (cached) {
      return cached;
    }
    const constantMultiplier = getGeneratedJudgeConstantSkillMultiplier(skill, perfectRate);
    if (innerScoreRates && Number.isFinite(constantMultiplier)) {
      const windowContributions = calculateConstantWindowContributionsFromRates(
        chart,
        skill,
        constantMultiplier,
        bandPower,
        innerScoreRates,
        constantWindowContributionCache,
      );
      const contributions = Array.from(windowContributions);
      contributionCache.set(skill.cacheKey, contributions);
      return contributions;
    }
    if (!innerScores) {
      return zeroContributions;
    }
    const contributions = Array.from({ length: 6 }, (_, slotIndex) => (
      calculateSkillExtraContribution(
        chart,
        skill,
        slotIndex,
        judgeList,
        innerScores,
        perfectRate,
        cache,
        constantWindowContributionCache,
      )
    ));
    contributionCache.set(skill.cacheKey, contributions);
    return contributions;
  };
  const contributions = skills.map((skill) => getContributions(skill));
  const averageTriggerContribution = contributions.reduce((sum, contribution) => (
    sum + (contribution[0] + contribution[1] + contribution[2] + contribution[3] + contribution[4]) / 5
  ), 0);

  let targetOnlyResult: SkillWindowScoreResult | null = null;
  if (encoreSkill !== undefined) {
    const leaderContribution = getContributions(encoreSkill)[5];
    const averageScore = Math.floor(baseScore + averageTriggerContribution + leaderContribution);
    targetOnlyResult = {
      score: averageScore,
      averageScore,
      minScore: averageScore,
      maxScoreOrderCount: 0,
      maxScoreOrderTotal: SKILL_ORDER_PERMUTATIONS.length,
      leaderIndex: 0,
      permutation: SKILL_ORDER_PERMUTATIONS[0],
    };
  } else {
    let bestAverageScore = Number.NEGATIVE_INFINITY;
    let selectedLeaderIndex = 0;
    for (let leaderIndex = 0; leaderIndex < skills.length; leaderIndex += 1) {
      const averageScore = Math.floor(baseScore + averageTriggerContribution + contributions[leaderIndex][5]);
      if (averageScore > bestAverageScore) {
        bestAverageScore = averageScore;
        selectedLeaderIndex = leaderIndex;
      }
    }
    targetOnlyResult = {
      score: bestAverageScore,
      averageScore: bestAverageScore,
      minScore: bestAverageScore,
      maxScoreOrderCount: 0,
      maxScoreOrderTotal: SKILL_ORDER_PERMUTATIONS.length,
      leaderIndex: selectedLeaderIndex,
      permutation: SKILL_ORDER_PERMUTATIONS[0],
    };
  }

  if (
    targetOnly
    || (
      targetOnlyResult
      && shouldCalculateDetailed
      && !shouldCalculateDetailed(targetOnlyResult)
    )
  ) {
    return targetOnlyResult;
  }

  const assignment = optimizeSkillAssignment(contributions);
  const bestTriggerScore = assignment.maxScore;
  const minTriggerScore = assignment.minScore;
  const bestTriggerScoreOrderCount = assignment.maxOrderCount;
  const bestTriggerPermutation = assignment.permutation;
  let bestAverageScore = Number.NEGATIVE_INFINITY;
  let selectedMaxScore = Number.NEGATIVE_INFINITY;
  let selectedMinScore = 0;
  let selectedLeaderIndex = 0;
  let selectedPermutation = bestTriggerPermutation;
  let selectedMaxScoreOrderCount = 0;

  if (encoreSkill !== undefined) {
    const leaderContribution = getContributions(encoreSkill)[5];
    return {
      score: baseScore + leaderContribution + bestTriggerScore,
      averageScore: Math.floor(baseScore + averageTriggerContribution + leaderContribution),
      minScore: baseScore + leaderContribution + minTriggerScore,
      maxScoreOrderCount: bestTriggerScoreOrderCount,
      maxScoreOrderTotal: SKILL_ORDER_PERMUTATIONS.length,
      leaderIndex: 0,
      permutation: bestTriggerPermutation,
    };
  }

  for (let leaderIndex = 0; leaderIndex < skills.length; leaderIndex += 1) {
    const leaderContribution = contributions[leaderIndex][5];
    const leaderAverageScore = Math.floor(baseScore + averageTriggerContribution + leaderContribution);
    if (leaderAverageScore < bestAverageScore) {
      continue;
    }

    const leaderBestScore = baseScore + leaderContribution + bestTriggerScore;
    if (
      leaderAverageScore > bestAverageScore
      || (leaderAverageScore === bestAverageScore && leaderBestScore > selectedMaxScore)
    ) {
      bestAverageScore = leaderAverageScore;
      selectedMaxScore = leaderBestScore;
      selectedMinScore = baseScore + leaderContribution + minTriggerScore;
      selectedLeaderIndex = leaderIndex;
      selectedPermutation = bestTriggerPermutation;
      selectedMaxScoreOrderCount = bestTriggerScoreOrderCount;
    }
  }

  return {
    score: selectedMaxScore,
    averageScore: bestAverageScore,
    minScore: selectedMinScore,
    maxScoreOrderCount: selectedMaxScoreOrderCount,
    maxScoreOrderTotal: SKILL_ORDER_PERMUTATIONS.length,
    leaderIndex: selectedLeaderIndex,
    permutation: selectedPermutation,
  };
}

export function calculateBaseScoreRatePerPower(chart: PreparedChart, comboOptions?: ScoreComboOptions): number {
  if (chart.notesCount === 0) {
    return 0;
  }

  const baseScorePerPower = 3 * (1 + (chart.playLevel - 5) / 100) / chart.notesCount;
  return chart.notes.reduce((sum, note, index) => (
    sum + baseScorePerPower * JUDGE_PERCENT.perfect * getScoreComboMultiplier(index, comboOptions) * (note.fever ? 2 : 1)
  ), 0);
}

// The coarse bound only needs the highest rate the skill can possibly provide, without resolving full team context.
function getSkillMaxValuePercent(skill: BestdoriSkillMaster | undefined, server: number): number {
  if (!skill) {
    return 0;
  }

  const effects = skill.activationEffect?.activateEffectTypes ?? {};
  const maxEffectValue = Object.entries(effects).reduce((max, [type, effect]) => {
    if (type === "score_rate_up_with_perfect") {
      return max;
    }
    return Math.max(max, getRegionalNumber(effect.activateEffectValue, server) ?? 0);
  }, 0);
  const unifiedValue = getRegionalNumber(skill.activationEffect?.unificationActivateEffectValue, server) ?? 0;
  const rateUpBonus = "score_rate_up_with_perfect" in effects ? 50 : 0;
  return Math.max(maxEffectValue, unifiedValue) + rateUpBonus;
}

export function getSkillDurationSeconds(skill: BestdoriSkillMaster | undefined, skillLevel: number, server: number): number {
  if (!skill) {
    return 0;
  }

  const normalizedSkillLevel = clamp(Math.trunc(skillLevel), 1, 5);
  return getRegionalNumber(
    Array.isArray(skill.duration) ? skill.duration[normalizedSkillLevel - 1] : skill.duration,
    server,
  ) ?? 0;
}

export function calculateSkillUpperRatesPerPower(
  chart: PreparedChart,
  skill: BestdoriSkillMaster | undefined,
  skillLevel: number,
  server: number,
  comboOptions?: ScoreComboOptions,
): SkillUpperRates {
  // This bound is intentionally optimistic: PERFECT judgment, best window, and maximum skill value for safe pruning and ordering.
  const valuePercent = getSkillMaxValuePercent(skill, server);
  const durationSeconds = getSkillDurationSeconds(skill, skillLevel, server);
  if (valuePercent <= 0 || durationSeconds <= 0 || chart.notesCount === 0) {
    return {
      maxRate: 0,
      averageRate: 0,
      leaderRate: 0,
    };
  }

  const baseScorePerPower = 3 * (1 + (chart.playLevel - 5) / 100) / chart.notesCount;
  let bestWindowRate = 0;
  let triggerWindowRateSum = 0;
  let leaderWindowRate = 0;
  for (let slotIndex = 0; slotIndex < 6; slotIndex += 1) {
    const start = chart.skillStartNotes[slotIndex] ?? chart.notesCount;
    const end = getSkillEndNote(chart, slotIndex, durationSeconds);
    let windowRate = 0;
    for (let noteIndex = start; noteIndex < end; noteIndex += 1) {
      const note = chart.notes[noteIndex];
      windowRate += baseScorePerPower * JUDGE_PERCENT.perfect * getScoreComboMultiplier(noteIndex, comboOptions) * (note.fever ? 2 : 1);
    }
    bestWindowRate = Math.max(bestWindowRate, windowRate);
    if (slotIndex < 5) {
      triggerWindowRateSum += windowRate;
    } else {
      leaderWindowRate = windowRate;
    }
  }

  return {
    maxRate: bestWindowRate * (valuePercent / 100),
    averageRate: (triggerWindowRateSum / 5) * (valuePercent / 100),
    leaderRate: leaderWindowRate * (valuePercent / 100),
  };
}

function getResolvedSkillMaxValuePercent(skill: ResolvedBandoriSkill | null): number {
  if (!skill) {
    return 0;
  }

  const maxEffectValue = skill.scoreEffects.reduce((max, effect) => (
    effect.type === "score_rate_up_with_perfect" ? max : Math.max(max, effect.valuePercent)
  ), 0);
  return maxEffectValue + (skill.hasRateUpWithPerfect ? 50 : 0);
}

export function calculateResolvedSkillUpperRatesPerPower(
  chart: PreparedChart,
  skill: ResolvedBandoriSkill | null,
  comboOptions?: ScoreComboOptions,
): SkillUpperRates {
  // Resolved skills can include same-band/same-attribute conditions, so these feed tighter context-partitioned bounds.
  const valuePercent = getResolvedSkillMaxValuePercent(skill);
  const durationSeconds = skill?.durationSeconds ?? 0;
  if (valuePercent <= 0 || durationSeconds <= 0 || chart.notesCount === 0) {
    return {
      maxRate: 0,
      averageRate: 0,
      leaderRate: 0,
    };
  }

  const baseScorePerPower = 3 * (1 + (chart.playLevel - 5) / 100) / chart.notesCount;
  let bestWindowRate = 0;
  let triggerWindowRateSum = 0;
  let leaderWindowRate = 0;
  for (let slotIndex = 0; slotIndex < 6; slotIndex += 1) {
    const start = chart.skillStartNotes[slotIndex] ?? chart.notesCount;
    const end = getSkillEndNote(chart, slotIndex, durationSeconds);
    let windowRate = 0;
    for (let noteIndex = start; noteIndex < end; noteIndex += 1) {
      const note = chart.notes[noteIndex];
      windowRate += baseScorePerPower * JUDGE_PERCENT.perfect * getScoreComboMultiplier(noteIndex, comboOptions) * (note.fever ? 2 : 1);
    }
    bestWindowRate = Math.max(bestWindowRate, windowRate);
    if (slotIndex < 5) {
      triggerWindowRateSum += windowRate;
    } else {
      leaderWindowRate = windowRate;
    }
  }

  return {
    maxRate: bestWindowRate * (valuePercent / 100),
    averageRate: (triggerWindowRateSum / 5) * (valuePercent / 100),
    leaderRate: leaderWindowRate * (valuePercent / 100),
  };
}
