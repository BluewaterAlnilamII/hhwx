/*
 * Exact/bounded fixed-team song optimization.
 *
 * v1 is deliberately narrow: fixed chart, fixed five-card team, discrete offset grid, and
 * non-overlapping skill windows. Incomplete searches return bounded instead of exact.
 */
import type {
  BandoriJudge,
  ResolvedBandoriScoreSkillEffect,
  ResolvedBandoriSkill,
} from "../core";
import { JUDGE_PERCENT, JUDGE_RANK, SCORE_FLOOR_EPSILON } from "../core/constants";
import { getScoreComboMultiplier } from "../core/chart";
import { buildPermutations } from "../core";
import {
  buildOptimizerTimeline,
  generateJudgementCandidates,
  type OptimizerNote,
  type OptimizerProofHitCandidate,
} from "./chart";
import type {
  BandoriSongOptimizerOffset,
  BandoriSongOptimizerProofJudgement,
  BandoriSongOptimizerProofStats,
  BandoriSongOptimizerResult,
  BandoriSongOptimizerSkillWindow,
  BandoriSongOptimizerUnsupportedReason,
  OptimizeBandoriSongScoreForFixedTeamOptions,
} from "./types";

const DEFAULT_STEP_FRAMES = 0.5;
const DEFAULT_MAX_EXACT_CANDIDATE_EVENTS = 32000;
const DEFAULT_MAX_EXACT_DP_STATES = 120000;
const SKILL_WINDOW_COUNT = 6;
const DEFAULT_LIFE = 1000;
const EPSILON = 1e-7;
const ZERO_MASK = BigInt(0);
const ONE_MASK = BigInt(1);
const SKILL_ORDER_PERMUTATIONS = buildPermutations([0, 1, 2, 3, 4]);

type CandidateEvent = OptimizerProofHitCandidate & {
  eventIndex: number;
  isLastForNote: boolean;
  noteMask: bigint;
};

type SearchLimits = {
  stepFrames: number;
  startedAt: number;
  deadline: number;
  maxExactCandidateEvents: number;
  maxExactDpStates: number;
};

type SearchContext = {
  notes: OptimizerNote[];
  playLevel: number;
  totalPower: number;
  baseScorePerPower: number;
  baseNoteScoreTable: Int32Array;
  futureUpperByHitCount: number[];
  generalScoreUpperBound: number;
  maxSkillMultiplier: number;
  usesDynamicSkillState: boolean;
  limits: SearchLimits;
  stats: BandoriSongOptimizerProofStats;
};

type DpChoice = BandoriSongOptimizerOffset;

type DpState = {
  score: number;
  hitCount: number;
  selectedMask: bigint;
  selectedKey: string;
  nextTriggerSlot: number;
  currentWindowEventIndex: number;
  currentWindowStartFrame: number;
  currentWindowEndFrame: number;
  perfectCount: number;
  continuedActive: boolean;
  offsetMagnitude: number;
  trailIndex: number;
};

type TrailNode = {
  parentIndex: number;
  note: OptimizerNote;
  event: OptimizerProofHitCandidate;
  window: BandoriSongOptimizerSkillWindow | null;
};

type IntegratedSolveResult = {
  status: "exact" | "bounded";
  score: number;
  scoreUpperBound: number;
  choices: DpChoice[];
  windows: BandoriSongOptimizerSkillWindow[];
  maxStateCount: number;
  prunedStateCount: number;
  candidateEventCount: number;
  boundedReason?: string;
};

function nowMs(): number {
  return Date.now();
}

function normalizeStepFrames(value: number | undefined): number {
  const normalized = Number.isFinite(value) ? Math.abs(value ?? DEFAULT_STEP_FRAMES) : DEFAULT_STEP_FRAMES;
  return normalized > 0 ? normalized : DEFAULT_STEP_FRAMES;
}

function createStats(noteCount: number, skillTriggerCount: number): BandoriSongOptimizerProofStats {
  return {
    noteCount,
    skillTriggerCount,
    leaderCount: 0,
    skillOrderCount: 0,
    attemptedWindowLayoutCount: 0,
    exactWindowLayoutCount: 0,
    boundedWindowLayoutCount: 0,
    overlapPrunedWindowCount: 0,
    rawWindowCandidateCount: 0,
    compressedWindowCandidateCount: 0,
    pgSearchProofMode: "notRun",
    integratedDpPassCount: 0,
    exactIntegratedDpPassCount: 0,
    boundedIntegratedDpPassCount: 0,
    layoutUpperBoundPrunedCount: 0,
    prunedDpStateCount: 0,
    maxDpStateCount: 0,
    maxCandidateEventCount: 0,
    pgSearchUpperBound: 0,
    lowJudgementUpperBound: 0,
    lowJudgementProofMode: "notRun",
    lowJudgementDomainClosed: false,
    lowJudgementDomainNotClosed: false,
    timedOut: false,
    boundedReasons: [],
    elapsedMs: 0,
  };
}

function addBoundedReason(stats: BandoriSongOptimizerProofStats, reason: string): void {
  if (!stats.boundedReasons.includes(reason)) {
    stats.boundedReasons.push(reason);
  }
}

function hasTimedOut(limits: SearchLimits, stats: BandoriSongOptimizerProofStats): boolean {
  if (nowMs() <= limits.deadline) {
    return false;
  }
  stats.timedOut = true;
  addBoundedReason(stats, "timeBudgetExceeded");
  return true;
}

function normalizeLeaderIndexes(leaderIndex: number | "auto" | undefined): number[] {
  if (leaderIndex === undefined || leaderIndex === "auto") {
    return [0, 1, 2, 3, 4];
  }
  const normalized = Math.trunc(leaderIndex);
  return normalized >= 0 && normalized < 5 ? [normalized] : [];
}

function normalizeSkillOrders(fixedSkillOrder: readonly number[] | undefined): number[][] {
  if (!fixedSkillOrder) {
    return SKILL_ORDER_PERMUTATIONS;
  }
  const order = fixedSkillOrder.slice(0, 5).map((value) => Math.trunc(value));
  const unique = new Set(order);
  return order.length === 5 && unique.size === 5 && order.every((value) => value >= 0 && value < 5)
    ? [order]
    : [];
}

function makeUnsupportedResult(
  stats: BandoriSongOptimizerProofStats,
  scoreUpperBound: number,
  unsupportedReason: BandoriSongOptimizerUnsupportedReason,
): BandoriSongOptimizerResult {
  stats.pgSearchUpperBound = scoreUpperBound;
  stats.lowJudgementUpperBound = scoreUpperBound;
  return {
    score: 0,
    searchMode: "unsupported",
    scoreUpperBound,
    pgSearchUpperBound: scoreUpperBound,
    lowJudgementUpperBound: scoreUpperBound,
    unsupportedReason,
    leaderIndex: null,
    skillOrder: [],
    skillWindows: [],
    movedNotes: [],
    proofStats: stats,
  };
}

function conditionMatches(effect: ResolvedBandoriScoreSkillEffect, judge: BandoriJudge): boolean {
  return effect.condition === "none" || JUDGE_RANK[judge] <= JUDGE_RANK[effect.condition];
}

function isGoodOrWorseJudge(judge: BandoriJudge): boolean {
  return JUDGE_RANK[judge] > JUDGE_RANK.great;
}

function isLifeConditionEligible(effect: ResolvedBandoriScoreSkillEffect): boolean {
  if (effect.conditionLife === null) {
    return true;
  }
  if (effect.type === "score_over_life") {
    return DEFAULT_LIFE >= effect.conditionLife;
  }
  if (effect.type === "score_under_life") {
    return DEFAULT_LIFE <= effect.conditionLife;
  }
  return true;
}

function getEffectMultiplier(
  effect: ResolvedBandoriScoreSkillEffect,
  judge: BandoriJudge,
  continuedActive: boolean,
  rateUpBonusPercent: number,
): { multiplier: number; continuedActive: boolean } {
  if (effect.type === "score_rate_up_with_perfect") {
    return { multiplier: 1, continuedActive };
  }
  if (!isLifeConditionEligible(effect)) {
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
    return conditionMatches(effect, judge)
      ? { multiplier: 1 + (effect.valuePercent + rateUpBonusPercent) / 100, continuedActive }
      : { multiplier: isGoodOrWorseJudge(judge) ? 0.5 : 1, continuedActive };
  }
  if (effect.type === "score_only_perfect") {
    return {
      multiplier: judge === "perfect" && conditionMatches(effect, judge)
        ? 1 + (effect.valuePercent + rateUpBonusPercent) / 100
        : 0,
      continuedActive,
    };
  }
  return conditionMatches(effect, judge)
    ? { multiplier: 1 + (effect.valuePercent + rateUpBonusPercent) / 100, continuedActive }
    : { multiplier: 1, continuedActive };
}

function evaluateSkillMultiplier(
  skill: ResolvedBandoriSkill | null,
  judge: BandoriJudge,
  previousPerfectCount: number,
  previousContinuedActive: boolean,
): { multiplier: number; perfectCount: number; continuedActive: boolean } {
  if (!skill || skill.scoreEffects.length === 0) {
    return { multiplier: 1, perfectCount: previousPerfectCount, continuedActive: previousContinuedActive };
  }
  const perfectCount = skill.hasRateUpWithPerfect && judge === "perfect"
    ? Math.min(previousPerfectCount + 1, 100)
    : previousPerfectCount;
  const rateUpBonusPercent = skill.hasRateUpWithPerfect ? 0.5 * perfectCount : 0;
  let multiplier = 1;
  let continuedActive = previousContinuedActive;
  for (const effect of skill.scoreEffects) {
    const next = getEffectMultiplier(effect, judge, continuedActive, rateUpBonusPercent);
    continuedActive = next.continuedActive;
    multiplier = Math.max(multiplier, next.multiplier);
  }
  return { multiplier: Math.max(0, multiplier), perfectCount, continuedActive };
}

function getResolvedSkillMaxMultiplier(skill: ResolvedBandoriSkill | null): number {
  if (!skill) {
    return 1;
  }
  const maxValuePercent = skill.scoreEffects.reduce((max, effect) => (
    effect.type === "score_rate_up_with_perfect" ? max : Math.max(max, effect.valuePercent)
  ), 0);
  return 1 + (maxValuePercent + (skill.hasRateUpWithPerfect ? 50 : 0)) / 100;
}

function requiresDynamicSkillState(skill: ResolvedBandoriSkill | null): boolean {
  return Boolean(
    skill
    && skill.durationSeconds > 0
    && (
      skill.hasRateUpWithPerfect
      || skill.scoreEffects.some((effect) => effect.type === "score_continued_note_judge")
    ),
  );
}

function hasActiveScoringSkill(skill: ResolvedBandoriSkill | null): boolean {
  return Boolean(skill && skill.durationSeconds > 0 && skill.scoreEffects.length > 0);
}

function calculatePerfectScoreUpperBound(
  notes: readonly OptimizerNote[],
  playLevel: number,
  totalPower: number,
  maxSkillMultiplier: number,
): number {
  if (notes.length === 0 || totalPower <= 0) {
    return 0;
  }
  const baseScorePerPower = 3 * (1 + (playLevel - 5) / 100) / notes.length;
  const noteWeights = notes.map((note) => JUDGE_PERCENT.perfect * (note.fever ? 2 : 1)).sort((a, b) => a - b);
  const comboMultipliers = Array.from({ length: notes.length }, (_, index) => getScoreComboMultiplier(index))
    .sort((a, b) => a - b);
  let score = 0;
  for (let index = 0; index < notes.length; index += 1) {
    const innerScore = Math.floor(totalPower * baseScorePerPower * noteWeights[index] * comboMultipliers[index]);
    score += Math.floor(innerScore * maxSkillMultiplier + SCORE_FLOOR_EPSILON);
  }
  return score;
}

function buildFutureUpperByHitCount(
  notes: readonly OptimizerNote[],
  playLevel: number,
  totalPower: number,
  maxSkillMultiplier: number,
): number[] {
  const result = new Array<number>(notes.length + 1).fill(0);
  const baseScorePerPower = 3 * (1 + (playLevel - 5) / 100) / notes.length;
  const noteFeverWeights = notes.map((note) => (note.fever ? 2 : 1)).sort((a, b) => b - a);
  for (let hitCount = notes.length - 1; hitCount >= 0; hitCount -= 1) {
    const remainingCount = notes.length - hitCount;
    const bestWeights = noteFeverWeights.slice(0, remainingCount).sort((a, b) => a - b);
    let upper = 0;
    for (let offset = 0; offset < remainingCount; offset += 1) {
      const innerScore = Math.floor(
        totalPower
        * baseScorePerPower
        * JUDGE_PERCENT.perfect
        * getScoreComboMultiplier(hitCount + offset)
        * bestWeights[offset],
      );
      upper += Math.floor(innerScore * maxSkillMultiplier + SCORE_FLOOR_EPSILON);
    }
    result[hitCount] = upper;
  }
  return result;
}

function getJudgeIndex(judgement: BandoriJudge): number {
  switch (judgement) {
    case "perfect":
      return 0;
    case "great":
      return 1;
    case "good":
      return 2;
    default:
      return 3;
  }
}

function getJudgeByIndex(index: number): BandoriJudge {
  switch (index) {
    case 0:
      return "perfect";
    case 1:
      return "great";
    case 2:
      return "good";
    default:
      return "bad";
  }
}

function buildBaseNoteScoreTable(
  notes: readonly OptimizerNote[],
  totalPower: number,
  baseScorePerPower: number,
): Int32Array {
  const table = new Int32Array(notes.length * 4 * notes.length);
  const judgePercents = [JUDGE_PERCENT.perfect, JUDGE_PERCENT.great, JUDGE_PERCENT.good, JUDGE_PERCENT.bad];
  for (const note of notes) {
    const feverMultiplier = note.fever ? 2 : 1;
    for (let judgeIndex = 0; judgeIndex < judgePercents.length; judgeIndex += 1) {
      const baseOffset = (note.noteIndex * 4 + judgeIndex) * notes.length;
      for (let hitCount = 0; hitCount < notes.length; hitCount += 1) {
        table[baseOffset + hitCount] = Math.floor(
          totalPower
          * baseScorePerPower
          * judgePercents[judgeIndex]
          * getScoreComboMultiplier(hitCount)
          * feverMultiplier,
        );
      }
    }
  }
  return table;
}

function getBaseNoteScore(
  context: SearchContext,
  noteIndex: number,
  judgement: BandoriJudge,
  hitCount: number,
): number {
  return context.baseNoteScoreTable[(noteIndex * 4 + getJudgeIndex(judgement)) * context.notes.length + hitCount] ?? 0;
}

function buildStaticSkillMultipliers(slotSkills: ReadonlyArray<ResolvedBandoriSkill | null>): Float64Array {
  const multipliers = new Float64Array(SKILL_WINDOW_COUNT * 4);
  for (let slotIndex = 0; slotIndex < SKILL_WINDOW_COUNT; slotIndex += 1) {
    const skill = slotSkills[slotIndex] ?? null;
    for (let judgeIndex = 0; judgeIndex < 4; judgeIndex += 1) {
      multipliers[slotIndex * 4 + judgeIndex] = evaluateSkillMultiplier(skill, getJudgeByIndex(judgeIndex), 0, true).multiplier;
    }
  }
  return multipliers;
}

function frameKey(frame: number): string {
  return Math.round(frame * 1_000_000).toString();
}

function compareCandidateEvents(left: Pick<OptimizerProofHitCandidate, "hitFrame" | "noteIndex">, right: Pick<OptimizerProofHitCandidate, "hitFrame" | "noteIndex">): number {
  return Math.round(left.hitFrame * 1_000_000) - Math.round(right.hitFrame * 1_000_000)
    || left.noteIndex - right.noteIndex;
}

function compressCandidateLists(
  candidateLists: ReadonlyArray<readonly OptimizerProofHitCandidate[]>,
  triggerSlotByNoteIndex: ReadonlyMap<number, number>,
  slotSkills: ReadonlyArray<ResolvedBandoriSkill | null>,
  collapseDominatedJudgements: boolean,
): OptimizerProofHitCandidate[][] {
  const globalFrameCounts = new Map<string, { frame: number; count: number }>();
  const noteFrameCounts = candidateLists.map((candidates) => {
    const counts = new Map<string, number>();
    for (const candidate of candidates) {
      const key = frameKey(candidate.hitFrame);
      globalFrameCounts.set(key, {
        frame: candidate.hitFrame,
        count: (globalFrameCounts.get(key)?.count ?? 0) + 1,
      });
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  });
  const globalFrames = [...globalFrameCounts.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => a.frame - b.frame);
  const boundaryFrames = new Map<string, number>();
  triggerSlotByNoteIndex.forEach((slotIndex, noteIndex) => {
    const durationFrames = (slotSkills[slotIndex]?.durationSeconds ?? 0) * 60;
    candidateLists[noteIndex]?.forEach((candidate) => {
      boundaryFrames.set(frameKey(candidate.hitFrame), candidate.hitFrame);
      boundaryFrames.set(frameKey(candidate.hitFrame + durationFrames), candidate.hitFrame + durationFrames);
    });
  });
  const sortedBoundaryFrames = [...boundaryFrames.values()].sort((a, b) => a - b);

  return candidateLists.map((candidates, noteIndex) => {
    if (triggerSlotByNoteIndex.has(noteIndex) || candidates.length <= 1) {
      return [...candidates];
    }
    let minHitFrame = Number.POSITIVE_INFINITY;
    let maxHitFrame = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
      minHitFrame = Math.min(minHitFrame, candidate.hitFrame);
      maxHitFrame = Math.max(maxHitFrame, candidate.hitFrame);
    }
    const criticalFrames = new Map<string, number>();
    const ownCounts = noteFrameCounts[noteIndex] ?? new Map<string, number>();
    for (const frame of globalFrames) {
      if (frame.frame < minHitFrame - EPSILON) {
        continue;
      }
      if (frame.frame > maxHitFrame + EPSILON) {
        break;
      }
      if (frame.count > (ownCounts.get(frame.key) ?? 0)) {
        criticalFrames.set(frame.key, frame.frame);
      }
    }
    for (const frame of sortedBoundaryFrames) {
      if (frame >= minHitFrame - EPSILON && frame <= maxHitFrame + EPSILON) {
        criticalFrames.set(frameKey(frame), frame);
      }
    }
    const sortedCritical = [...criticalFrames.values()].sort((a, b) => a - b);
    const compressed = new Map<string, OptimizerProofHitCandidate>();
    for (const candidate of candidates) {
      let lowerBound = 0;
      while (lowerBound < sortedCritical.length && sortedCritical[lowerBound] < candidate.hitFrame - EPSILON) {
        lowerBound += 1;
      }
      const isEqual = lowerBound < sortedCritical.length
        && Math.abs(sortedCritical[lowerBound] - candidate.hitFrame) <= EPSILON;
      const cellKey = `${lowerBound}:${isEqual ? 1 : 0}:${collapseDominatedJudgements ? "" : candidate.judgement}`;
      const existing = compressed.get(cellKey);
      const shouldReplace = !existing
        || (
          collapseDominatedJudgements
            ? (
              JUDGE_RANK[candidate.judgement] < JUDGE_RANK[existing.judgement]
              || (
                JUDGE_RANK[candidate.judgement] === JUDGE_RANK[existing.judgement]
                && Math.abs(candidate.offsetFrames) < Math.abs(existing.offsetFrames)
              )
            )
            : Math.abs(candidate.offsetFrames) < Math.abs(existing.offsetFrames)
        );
      if (shouldReplace) {
        compressed.set(cellKey, candidate);
      }
    }
    return [...compressed.values()].sort(compareCandidateEvents);
  });
}

function buildCandidateEvents(candidateLists: ReadonlyArray<readonly OptimizerProofHitCandidate[]>): CandidateEvent[] | null {
  if (candidateLists.some((candidates) => candidates.length === 0)) {
    return null;
  }
  const events: CandidateEvent[] = [];
  for (const candidates of candidateLists) {
    for (const candidate of candidates) {
      events.push({
        ...candidate,
        eventIndex: 0,
        isLastForNote: false,
        noteMask: ONE_MASK << BigInt(candidate.noteIndex),
      });
    }
  }
  events.sort(compareCandidateEvents);
  events.forEach((event, eventIndex) => {
    event.eventIndex = eventIndex;
  });
  const lastEventIndexByNote = new Map<number, number>();
  for (const event of events) {
    lastEventIndexByNote.set(event.noteIndex, event.eventIndex);
  }
  for (const event of events) {
    event.isLastForNote = lastEventIndexByNote.get(event.noteIndex) === event.eventIndex;
  }
  return events;
}

function getActiveWindowIndex(state: DpState, hitFrame: number): number | null {
  if (state.nextTriggerSlot <= 0) {
    return null;
  }
  const slotIndex = state.nextTriggerSlot - 1;
  return hitFrame > state.currentWindowStartFrame + EPSILON && hitFrame <= state.currentWindowEndFrame + EPSILON
    ? slotIndex
    : null;
}

function scoreEvent(
  context: SearchContext,
  slotSkills: ReadonlyArray<ResolvedBandoriSkill | null>,
  state: DpState,
  event: CandidateEvent | OptimizerProofHitCandidate,
  staticSkillMultipliers: Float64Array | null,
): { noteScore: number; perfectCount: number; continuedActive: boolean } {
  const activeWindowIndex = getActiveWindowIndex(state, event.hitFrame);
  const innerScore = getBaseNoteScore(context, event.noteIndex, event.judgement, state.hitCount);
  if (staticSkillMultipliers) {
    if (activeWindowIndex === null) {
      return { noteScore: innerScore, perfectCount: 0, continuedActive: true };
    }
    const multiplier = staticSkillMultipliers[activeWindowIndex * 4 + getJudgeIndex(event.judgement)] ?? 1;
    return {
      noteScore: Math.floor(innerScore * multiplier + SCORE_FLOOR_EPSILON),
      perfectCount: 0,
      continuedActive: true,
    };
  }
  const skill = activeWindowIndex === null ? null : slotSkills[activeWindowIndex] ?? null;
  const skillResult = evaluateSkillMultiplier(
    skill,
    event.judgement,
    activeWindowIndex === null ? 0 : state.perfectCount,
    activeWindowIndex === null ? true : state.continuedActive,
  );
  return {
    noteScore: Math.floor(innerScore * skillResult.multiplier + SCORE_FLOOR_EPSILON),
    perfectCount: activeWindowIndex === null ? 0 : skillResult.perfectCount,
    continuedActive: activeWindowIndex === null ? true : skillResult.continuedActive,
  };
}

function createSkillWindow(
  slotIndex: number,
  cardIndex: number,
  triggerNote: OptimizerNote,
  triggerCandidate: OptimizerProofHitCandidate,
  durationSeconds: number,
): BandoriSongOptimizerSkillWindow {
  return {
    slotIndex,
    cardIndex,
    triggerNoteIndex: triggerNote.noteIndex,
    triggerSourceIndex: triggerNote.sourceIndex,
    startFrame: triggerCandidate.hitFrame,
    endFrame: triggerCandidate.hitFrame + durationSeconds * 60,
    offsetFrames: triggerCandidate.offsetFrames,
    judgement: triggerCandidate.judgement,
  };
}

function createChoice(note: OptimizerNote, event: OptimizerProofHitCandidate): DpChoice {
  return {
    noteIndex: note.noteIndex,
    sourceIndex: note.sourceIndex,
    noteType: note.type,
    originalFrame: note.frame,
    hitFrame: event.hitFrame,
    offsetFrames: event.offsetFrames,
    judgement: event.judgement,
  };
}

function pushTrail(trail: TrailNode[], parentIndex: number, note: OptimizerNote, event: OptimizerProofHitCandidate, window: BandoriSongOptimizerSkillWindow | null): number {
  trail.push({ parentIndex, note, event, window });
  return trail.length - 1;
}

function reconstructTrail(trail: readonly TrailNode[], trailIndex: number): { choices: DpChoice[]; windows: BandoriSongOptimizerSkillWindow[] } {
  const choices: DpChoice[] = [];
  const windows: BandoriSongOptimizerSkillWindow[] = [];
  for (let index = trailIndex; index >= 0;) {
    const node = trail[index];
    choices.push(createChoice(node.note, node.event));
    if (node.window) {
      windows.push(node.window);
    }
    index = node.parentIndex;
  }
  choices.reverse();
  windows.reverse();
  return { choices, windows };
}

function toMaskKey(mask: bigint): string {
  return mask === ZERO_MASK ? "" : mask.toString(36);
}

function getStateKey(state: DpState, usesDynamicSkillState: boolean): string {
  const baseKey = `${state.hitCount}:${state.selectedKey}:${state.nextTriggerSlot}:${state.currentWindowEventIndex}`;
  return usesDynamicSkillState
    ? `${baseKey}:${state.perfectCount}:${state.continuedActive ? 1 : 0}`
    : baseKey;
}

function mergeState(
  states: Map<string, DpState>,
  state: DpState,
  usesDynamicSkillState: boolean,
): void {
  const key = getStateKey(state, usesDynamicSkillState);
  const existing = states.get(key);
  if (
    !existing
    || state.score > existing.score
    || (state.score === existing.score && state.offsetMagnitude < existing.offsetMagnitude)
  ) {
    states.set(key, state);
  }
}

function mergeChosenState(
  states: Map<string, DpState>,
  state: DpState,
  trail: TrailNode[],
  parentTrailIndex: number,
  note: OptimizerNote,
  event: CandidateEvent,
  window: BandoriSongOptimizerSkillWindow | null,
  usesDynamicSkillState: boolean,
): void {
  const key = getStateKey(state, usesDynamicSkillState);
  const existing = states.get(key);
  if (
    existing
    && (
      existing.score > state.score
      || (existing.score === state.score && existing.offsetMagnitude <= state.offsetMagnitude)
    )
  ) {
    return;
  }
  state.trailIndex = pushTrail(trail, parentTrailIndex, note, event, window);
  states.set(key, state);
}

function buildOriginalPerfectIncumbent(
  context: SearchContext,
  triggerSlotByNoteIndex: ReadonlyMap<number, number>,
  skillOrder: readonly number[],
  slotSkills: ReadonlyArray<ResolvedBandoriSkill | null>,
): { score: number; choices: DpChoice[]; windows: BandoriSongOptimizerSkillWindow[] } | null {
  const staticSkillMultipliers = context.usesDynamicSkillState ? null : buildStaticSkillMultipliers(slotSkills);
  const choices: DpChoice[] = [];
  const windows: BandoriSongOptimizerSkillWindow[] = [];
  let state: DpState = {
    score: 0,
    hitCount: 0,
    selectedMask: ZERO_MASK,
    selectedKey: "",
    nextTriggerSlot: 0,
    currentWindowEventIndex: -1,
    currentWindowStartFrame: Number.NEGATIVE_INFINITY,
    currentWindowEndFrame: Number.NEGATIVE_INFINITY,
    perfectCount: 0,
    continuedActive: true,
    offsetMagnitude: 0,
    trailIndex: -1,
  };
  for (const note of context.notes) {
    const event: OptimizerProofHitCandidate = {
      noteIndex: note.noteIndex,
      offsetFrames: 0,
      hitFrame: note.frame,
      judgement: "perfect",
    };
    const triggerSlot = triggerSlotByNoteIndex.get(note.noteIndex);
    if (triggerSlot !== undefined) {
      if (triggerSlot !== state.nextTriggerSlot) {
        return null;
      }
      if (triggerSlot > 0 && event.hitFrame <= state.currentWindowEndFrame + EPSILON) {
        return null;
      }
    }
    const scored = triggerSlot === undefined
      ? scoreEvent(context, slotSkills, state, event, staticSkillMultipliers)
      : { noteScore: getBaseNoteScore(context, event.noteIndex, event.judgement, state.hitCount), perfectCount: 0, continuedActive: true };
    let nextTriggerSlot = state.nextTriggerSlot;
    let currentWindowStartFrame = state.currentWindowStartFrame;
    let currentWindowEndFrame = state.currentWindowEndFrame;
    let currentWindowEventIndex = state.currentWindowEventIndex;
    let perfectCount = scored.perfectCount;
    let continuedActive = scored.continuedActive;
    if (triggerSlot !== undefined) {
      const window = createSkillWindow(
        triggerSlot,
        skillOrder[triggerSlot],
        note,
        event,
        slotSkills[triggerSlot]?.durationSeconds ?? 0,
      );
      windows.push(window);
      nextTriggerSlot = triggerSlot + 1;
      currentWindowStartFrame = window.startFrame;
      currentWindowEndFrame = window.endFrame;
      currentWindowEventIndex = -1;
      perfectCount = 0;
      continuedActive = true;
    }
    choices.push(createChoice(note, event));
    state = {
      ...state,
      score: state.score + scored.noteScore,
      hitCount: state.hitCount + 1,
      nextTriggerSlot,
      currentWindowStartFrame,
      currentWindowEndFrame,
      currentWindowEventIndex,
      perfectCount,
      continuedActive,
    };
  }
  return state.nextTriggerSlot === SKILL_WINDOW_COUNT
    ? { score: state.score, choices, windows }
    : null;
}

function solveIntegratedDp(
  context: SearchContext,
  candidateLists: ReadonlyArray<readonly OptimizerProofHitCandidate[]>,
  triggerSlotByNoteIndex: ReadonlyMap<number, number>,
  skillOrder: readonly number[],
  slotSkills: ReadonlyArray<ResolvedBandoriSkill | null>,
  incumbentScore: number,
  collapseDominatedJudgements: boolean,
): IntegratedSolveResult {
  const compressedCandidateLists = compressCandidateLists(
    candidateLists,
    triggerSlotByNoteIndex,
    slotSkills,
    collapseDominatedJudgements,
  );
  const events = buildCandidateEvents(compressedCandidateLists);
  if (!events) {
    return {
      status: "bounded",
      score: Number.NEGATIVE_INFINITY,
      scoreUpperBound: context.generalScoreUpperBound,
      choices: [],
      windows: [],
      maxStateCount: 0,
      prunedStateCount: 0,
      candidateEventCount: 0,
      boundedReason: "emptyCandidateDomain",
    };
  }
  if (events.length > context.limits.maxExactCandidateEvents) {
    return {
      status: "bounded",
      score: Number.NEGATIVE_INFINITY,
      scoreUpperBound: context.generalScoreUpperBound,
      choices: [],
      windows: [],
      maxStateCount: 0,
      prunedStateCount: 0,
      candidateEventCount: events.length,
      boundedReason: "candidateEventLimitExceeded",
    };
  }

  const staticSkillMultipliers = context.usesDynamicSkillState ? null : buildStaticSkillMultipliers(slotSkills);
  const trail: TrailNode[] = [];
  let states = new Map<string, DpState>();
  mergeState(
    states,
    {
      score: 0,
      hitCount: 0,
      selectedMask: ZERO_MASK,
      selectedKey: "",
      nextTriggerSlot: 0,
      currentWindowEventIndex: -1,
      currentWindowStartFrame: Number.NEGATIVE_INFINITY,
      currentWindowEndFrame: Number.NEGATIVE_INFINITY,
      perfectCount: 0,
      continuedActive: true,
      offsetMagnitude: 0,
      trailIndex: -1,
    },
    context.usesDynamicSkillState,
  );

  let maxStateCount = states.size;
  let prunedStateCount = 0;
  for (const event of events) {
    if (event.eventIndex % 64 === 0 && hasTimedOut(context.limits, context.stats)) {
      return {
        status: "bounded",
        score: Number.NEGATIVE_INFINITY,
        scoreUpperBound: context.generalScoreUpperBound,
        choices: [],
        windows: [],
        maxStateCount,
        prunedStateCount,
        candidateEventCount: events.length,
        boundedReason: "timeBudgetExceeded",
      };
    }

    const currentStates = [...states.values()];
    const nextStates = event.isLastForNote ? new Map<string, DpState>() : states;
    for (const state of currentStates) {
      const selected = (state.selectedMask & event.noteMask) !== ZERO_MASK;
      if (event.isLastForNote && selected) {
        const nextMask = state.selectedMask & ~event.noteMask;
        mergeState(
          nextStates,
          {
            ...state,
            selectedMask: nextMask,
            selectedKey: toMaskKey(nextMask),
          },
          context.usesDynamicSkillState,
        );
      }
      if (selected) {
        continue;
      }

      const triggerSlot = triggerSlotByNoteIndex.get(event.noteIndex);
      if (triggerSlot !== undefined) {
        if (triggerSlot !== state.nextTriggerSlot) {
          continue;
        }
        if (triggerSlot > 0 && event.hitFrame <= state.currentWindowEndFrame + EPSILON) {
          context.stats.overlapPrunedWindowCount += 1;
          continue;
        }
      }

      const scored = triggerSlot === undefined
        ? scoreEvent(context, slotSkills, state, event, staticSkillMultipliers)
        : {
          noteScore: getBaseNoteScore(context, event.noteIndex, event.judgement, state.hitCount),
          perfectCount: 0,
          continuedActive: true,
        };
      const nextScore = state.score + scored.noteScore;
      const futureUpper = context.futureUpperByHitCount[state.hitCount + 1] ?? 0;
      if (nextScore + futureUpper <= incumbentScore) {
        prunedStateCount += 1;
        continue;
      }

      const note = context.notes[event.noteIndex];
      let nextTriggerSlot = state.nextTriggerSlot;
      let currentWindowEventIndex = state.currentWindowEventIndex;
      let currentWindowStartFrame = state.currentWindowStartFrame;
      let currentWindowEndFrame = state.currentWindowEndFrame;
      let perfectCount = scored.perfectCount;
      let continuedActive = scored.continuedActive;
      let window: BandoriSongOptimizerSkillWindow | null = null;
      if (triggerSlot !== undefined) {
        window = createSkillWindow(
          triggerSlot,
          skillOrder[triggerSlot],
          note,
          event,
          slotSkills[triggerSlot]?.durationSeconds ?? 0,
        );
        nextTriggerSlot = triggerSlot + 1;
        currentWindowEventIndex = event.eventIndex;
        currentWindowStartFrame = window.startFrame;
        currentWindowEndFrame = window.endFrame;
        perfectCount = 0;
        continuedActive = true;
      }
      const nextMask = event.isLastForNote ? state.selectedMask : state.selectedMask | event.noteMask;
      mergeChosenState(
        nextStates,
        {
          score: nextScore,
          hitCount: state.hitCount + 1,
          selectedMask: nextMask,
          selectedKey: toMaskKey(nextMask),
          nextTriggerSlot,
          currentWindowEventIndex,
          currentWindowStartFrame,
          currentWindowEndFrame,
          perfectCount,
          continuedActive,
          offsetMagnitude: state.offsetMagnitude + Math.abs(event.offsetFrames),
          trailIndex: state.trailIndex,
        },
        trail,
        state.trailIndex,
        note,
        event,
        window,
        context.usesDynamicSkillState,
      );
    }

    states = nextStates;
    maxStateCount = Math.max(maxStateCount, states.size);
    if (states.size > context.limits.maxExactDpStates) {
      return {
        status: "bounded",
        score: Number.NEGATIVE_INFINITY,
        scoreUpperBound: context.generalScoreUpperBound,
        choices: [],
        windows: [],
        maxStateCount,
        prunedStateCount,
        candidateEventCount: events.length,
        boundedReason: "dpStateLimitExceeded",
      };
    }
    if (states.size === 0) {
      break;
    }
  }

  let best: DpState | null = null;
  for (const state of states.values()) {
    if (state.hitCount !== context.notes.length || state.selectedMask !== ZERO_MASK || state.nextTriggerSlot !== SKILL_WINDOW_COUNT) {
      continue;
    }
    if (
      !best
      || state.score > best.score
      || (state.score === best.score && state.offsetMagnitude < best.offsetMagnitude)
    ) {
      best = state;
    }
  }
  const reconstructed = best ? reconstructTrail(trail, best.trailIndex) : { choices: [], windows: [] };
  return {
    status: "exact",
    score: best?.score ?? Number.NEGATIVE_INFINITY,
    scoreUpperBound: best?.score ?? incumbentScore,
    choices: reconstructed.choices,
    windows: reconstructed.windows,
    maxStateCount,
    prunedStateCount,
    candidateEventCount: events.length,
  };
}

function toMovedNotes(choices: readonly DpChoice[]): BandoriSongOptimizerOffset[] {
  return choices
    .filter((choice) => Math.abs(choice.offsetFrames) > EPSILON)
    .sort((left, right) => left.noteIndex - right.noteIndex);
}

const MONOTONIC_LOW_JUDGEMENT_EFFECT_TYPES = new Set([
  "score",
  "score_over_life",
  "score_under_life",
  "score_continued_note_judge",
  "score_under_great_half",
  "score_only_perfect",
  "score_rate_up_with_perfect",
]);

function isMonotonicLowJudgementSkill(skill: ResolvedBandoriSkill | null): boolean {
  if (!skill || skill.durationSeconds <= 0 || skill.scoreEffects.length === 0) {
    return true;
  }
  return skill.scoreEffects.every((effect) => (
    MONOTONIC_LOW_JUDGEMENT_EFFECT_TYPES.has(effect.type)
    && Number.isFinite(effect.valuePercent)
    && effect.valuePercent >= 0
  ));
}

export function optimizeBandoriSongScoreForFixedTeam(
  options: OptimizeBandoriSongScoreForFixedTeamOptions,
): BandoriSongOptimizerResult {
  const stepFrames = normalizeStepFrames(options.stepFrames);
  const timeline = buildOptimizerTimeline(options.chart, options.useFever ?? true);
  const stats = createStats(timeline.notes.length, timeline.skillTriggerNoteIndexes.length);
  const startedAt = nowMs();
  const limits: SearchLimits = {
    stepFrames,
    startedAt,
    deadline: options.maxSearchDurationMs && options.maxSearchDurationMs > 0
      ? startedAt + options.maxSearchDurationMs
      : Number.POSITIVE_INFINITY,
    maxExactCandidateEvents: Math.max(1, Math.trunc(options.maxExactCandidateEvents ?? DEFAULT_MAX_EXACT_CANDIDATE_EVENTS)),
    maxExactDpStates: Math.max(1, Math.trunc(options.maxExactDpStates ?? DEFAULT_MAX_EXACT_DP_STATES)),
  };

  const skills = options.skills.slice(0, 5);
  const leaderIndexes = normalizeLeaderIndexes(options.leaderIndex);
  const skillOrders = normalizeSkillOrders(options.fixedSkillOrder);
  stats.leaderCount = leaderIndexes.length;
  stats.skillOrderCount = skillOrders.length;

  const maxSkillMultiplier = Math.max(1, ...skills.map((skill) => getResolvedSkillMaxMultiplier(skill ?? null)));
  const generalScoreUpperBound = calculatePerfectScoreUpperBound(
    timeline.notes,
    options.playLevel,
    Math.floor(options.totalPower),
    maxSkillMultiplier,
  );

  if (timeline.notes.length === 0) {
    stats.elapsedMs = nowMs() - startedAt;
    return makeUnsupportedResult(stats, 0, "emptyChart");
  }
  if (skills.length !== 5 || leaderIndexes.length === 0 || skillOrders.length === 0 || options.totalPower <= 0) {
    stats.elapsedMs = nowMs() - startedAt;
    return makeUnsupportedResult(stats, generalScoreUpperBound, "invalidInput");
  }
  if (timeline.skillTriggerNoteIndexes.length < SKILL_WINDOW_COUNT) {
    stats.elapsedMs = nowMs() - startedAt;
    return makeUnsupportedResult(stats, generalScoreUpperBound, "notEnoughSkillTriggers");
  }

  const includeLowJudgements = true;
  const candidateLists = timeline.notes.map((note) => generateJudgementCandidates(note, stepFrames, includeLowJudgements));
  const triggerCandidates = timeline.skillTriggerNoteIndexes
    .slice(0, SKILL_WINDOW_COUNT)
    .map((noteIndex) => candidateLists[noteIndex] ?? []);
  stats.rawWindowCandidateCount = triggerCandidates.reduce((sum, candidates) => sum + candidates.length, 0);
  stats.compressedWindowCandidateCount = stats.rawWindowCandidateCount;
  if (triggerCandidates.some((candidates) => candidates.length === 0)) {
    stats.elapsedMs = nowMs() - startedAt;
    return makeUnsupportedResult(stats, generalScoreUpperBound, "invalidInput");
  }

  const totalPower = Math.floor(options.totalPower);
  const baseScorePerPower = 3 * (1 + (options.playLevel - 5) / 100) / timeline.notes.length;
  const hasScoringSkills = skills.some((skill) => hasActiveScoringSkill(skill ?? null));
  const usesDynamicSkillState = skills.some((skill) => requiresDynamicSkillState(skill ?? null));
  const hasMonotonicLowJudgementSkills = skills.every((skill) => isMonotonicLowJudgementSkill(skill ?? null));
  const context: SearchContext = {
    notes: timeline.notes,
    playLevel: options.playLevel,
    totalPower,
    baseScorePerPower,
    baseNoteScoreTable: buildBaseNoteScoreTable(timeline.notes, totalPower, baseScorePerPower),
    futureUpperByHitCount: buildFutureUpperByHitCount(timeline.notes, options.playLevel, totalPower, maxSkillMultiplier),
    generalScoreUpperBound,
    maxSkillMultiplier,
    usesDynamicSkillState,
    limits,
    stats,
  };

  let bestScore = Number.NEGATIVE_INFINITY;
  let bestLeaderIndex: number | null = null;
  let bestSkillOrder: number[] = [];
  let bestWindows: BandoriSongOptimizerSkillWindow[] = [];
  let bestChoices: BandoriSongOptimizerOffset[] = [];
  let bounded = false;
  let sawAnyLayout = false;
  const triggerSlotByNoteIndex = new Map<number, number>();
  timeline.skillTriggerNoteIndexes.slice(0, SKILL_WINDOW_COUNT).forEach((noteIndex, slotIndex) => {
    triggerSlotByNoteIndex.set(noteIndex, slotIndex);
  });

  stats.pgSearchProofMode = hasScoringSkills ? "integratedAllJudgementDp" : "noSkillCandidateDp";
  stats.lowJudgementProofMode = hasScoringSkills ? "integratedAllJudgement" : "exactNoSkill";

  for (const leaderIndex of leaderIndexes) {
    for (const skillOrderPrefix of skillOrders) {
      if (bounded || hasTimedOut(limits, stats)) {
        bounded = true;
        break;
      }
      const skillOrder = [...skillOrderPrefix, leaderIndex];
      const slotSkills = skillOrder.map((cardIndex) => skills[cardIndex] ?? null);
      const incumbent = buildOriginalPerfectIncumbent(context, triggerSlotByNoteIndex, skillOrder, slotSkills);
      if (incumbent) {
        sawAnyLayout = true;
        if (incumbent.score > bestScore) {
          bestScore = incumbent.score;
          bestLeaderIndex = leaderIndex;
          bestSkillOrder = skillOrder;
          bestWindows = incumbent.windows;
          bestChoices = incumbent.choices;
        }
      }
      stats.integratedDpPassCount += 1;
      stats.attemptedWindowLayoutCount = stats.integratedDpPassCount;
      const result = solveIntegratedDp(
        context,
        candidateLists,
        triggerSlotByNoteIndex,
        skillOrder,
        slotSkills,
        bestScore,
        hasMonotonicLowJudgementSkills,
      );
      stats.maxDpStateCount = Math.max(stats.maxDpStateCount, result.maxStateCount);
      stats.prunedDpStateCount += result.prunedStateCount;
      stats.maxCandidateEventCount = Math.max(stats.maxCandidateEventCount, result.candidateEventCount);
      if (result.status === "bounded") {
        bounded = true;
        stats.boundedIntegratedDpPassCount += 1;
        stats.boundedWindowLayoutCount = stats.boundedIntegratedDpPassCount;
        stats.lowJudgementProofMode = "integratedAllJudgementBounded";
        addBoundedReason(stats, result.boundedReason ?? "integratedDpNotClosed");
        break;
      }
      stats.exactIntegratedDpPassCount += 1;
      stats.exactWindowLayoutCount = stats.exactIntegratedDpPassCount;
      if (Number.isFinite(result.score)) {
        sawAnyLayout = true;
      }
      if (result.score > bestScore) {
        bestScore = result.score;
        bestLeaderIndex = leaderIndex;
        bestSkillOrder = skillOrder;
        bestWindows = result.windows;
        bestChoices = result.choices;
      }
    }
  }

  stats.elapsedMs = nowMs() - startedAt;
  if (!sawAnyLayout && !bounded) {
    return makeUnsupportedResult(stats, generalScoreUpperBound, "overlappingSkillWindow");
  }
  const exact = sawAnyLayout && !bounded && Number.isFinite(bestScore);
  if (!exact) {
    stats.lowJudgementDomainClosed = false;
    stats.lowJudgementDomainNotClosed = true;
    addBoundedReason(stats, "lowJudgementDomainNotClosed");
  } else {
    stats.lowJudgementDomainClosed = true;
    stats.lowJudgementDomainNotClosed = false;
  }
  const score = Number.isFinite(bestScore) ? bestScore : 0;
  const scoreUpperBound = exact ? score : Math.max(score, generalScoreUpperBound);
  stats.pgSearchUpperBound = scoreUpperBound;
  stats.lowJudgementUpperBound = scoreUpperBound;
  return {
    score,
    searchMode: exact ? "exact" : "bounded",
    scoreUpperBound,
    pgSearchUpperBound: scoreUpperBound,
    lowJudgementUpperBound: scoreUpperBound,
    leaderIndex: bestLeaderIndex,
    skillOrder: bestSkillOrder,
    skillWindows: bestWindows,
    movedNotes: toMovedNotes(bestChoices),
    proofStats: stats,
  };
}
