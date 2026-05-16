import {
  BANDORI_AREA_ITEM_IDS_BY_GROUP,
} from "@/lib/bandori-area-item-groups";
import {
  calculateBandoriCard,
  calculateBandoriCardEventBonus,
  calculateBandoriSelectedAreaItemPower,
  getBandoriTeamContext,
  resolveBandoriSkill,
  type BandoriCardAttribute,
  type BandoriCharacterBonusState,
  type BandoriEventBonus,
  type BandoriJudge,
  type BandoriUserAreaItemState,
  type BandoriUserCardState,
  type BestdoriAreaItemMaster,
  type BestdoriCardMaster,
  type BestdoriSkillMaster,
  type CalculatedBandoriCard,
  type ResolvedBandoriScoreSkillEffect,
  type ResolvedBandoriSkill,
} from "@/lib/bandori-team-calculator";

export const BANDORI_TEAM_SEARCH_DIFFICULTIES = ["easy", "normal", "hard", "expert", "special"] as const;

export type BandoriTeamSearchDifficulty = typeof BANDORI_TEAM_SEARCH_DIFFICULTIES[number];

export type BestdoriSongMaster = {
  difficulty?: Record<string, {
    playLevel?: unknown;
  }>;
};

export type BestdoriChartEntity = Record<string, unknown>;

export type BandoriAreaItemConfiguration = {
  bandKey: string | null;
  attribute: BandoriCardAttribute | null;
  parameter: "performance" | "technique" | "visual" | null;
  selectedAreaItemIds: number[];
};

export type BandoriTeamSearchResultCard = {
  cardId: number;
  characterId: number;
  bandId: number | null;
  attribute: BandoriCardAttribute;
  rarity: number;
  skillId: number;
  skillLevel: number;
  level: number;
  masterRank: number;
  totalPower: number;
};

export type BandoriTeamSearchResult = {
  rank: number;
  score: number;
  averageScore: number;
  maxScore: number;
  minScore: number;
  maxScoreOrderCount: number;
  maxScoreOrderTotal: number;
  totalPower: number;
  rawCardPower: number;
  areaItemPower: number;
  eventPower: number;
  eventPowerWithRoom: number;
  pointBonusRate: number;
  leaderCardId: number;
  skillOrderCardIds: number[];
  areaItemConfiguration: BandoriAreaItemConfiguration;
  context: {
    sameBandId: number | null;
    sameAttribute: BandoriCardAttribute | null;
  };
  cards: BandoriTeamSearchResultCard[];
  skills: Array<{
    cardId: number;
    skillId: number;
    skillLevel: number;
    resolvedSkill: ResolvedBandoriSkill | null;
  }>;
};

export type BandoriTeamSearchStats = {
  candidateCardCount: number;
  compressedCandidateCount: number;
  areaItemConfigurationCount: number;
  enumeratedTeamCount: number;
  prunedBranchCount: number;
  elapsedMs: number;
  usedEventBonus: boolean;
  isExhaustive: boolean;
  timedOut: boolean;
  searchMode: "exact" | "bounded";
};

export type BandoriTeamSearchResponse = {
  results: BandoriTeamSearchResult[];
  stats: BandoriTeamSearchStats;
};

export type BandoriTeamSearchInput = {
  userCards: BandoriUserCardState[];
  userAreaItems: BandoriUserAreaItemState[];
  characterBonuses: BandoriCharacterBonusState[];
  cardsById: Record<string, BestdoriCardMaster | undefined>;
  charactersById: Record<string, { bandId?: number | null } | undefined>;
  skillsById: Record<string, BestdoriSkillMaster | undefined>;
  areaItemsById: Record<string, BestdoriAreaItemMaster | undefined>;
  chart: BestdoriChartEntity[];
  song: BestdoriSongMaster;
  difficulty: BandoriTeamSearchDifficulty;
  eventBonus?: BandoriEventBonus | null;
  resultLimit?: number;
  perfectRate?: number;
  useFever?: boolean;
  useSpecialRoomBonus?: boolean;
  server?: number;
  maxSearchDurationMs?: number;
};

type SearchCard = CalculatedBandoriCard & {
  effectivePower: number;
  skillUpperRate: number;
};

type SearchConfiguration = {
  configuration: BandoriAreaItemConfiguration;
  searchCards: SearchCard[];
  seedScore: number;
};

type PreparedNote = {
  beat: number;
  time: number;
  skill: boolean;
  fever: boolean;
};

type PreparedChart = {
  notes: PreparedNote[];
  playLevel: number;
  notesCount: number;
  skillStartNotes: number[];
  skillTriggerTimes: number[];
};

const DIFFICULTY_INDEX: Record<BandoriTeamSearchDifficulty, string> = {
  easy: "0",
  normal: "1",
  hard: "2",
  expert: "3",
  special: "4",
};

const BAND_AREA_ITEM_GROUP_KEYS = [
  "PoppinParty",
  "Afterglow",
  "HelloHappyWorld",
  "PastelPalettes",
  "Roselia",
  "Morfonica",
  "RaiseASuilen",
  "MyGO",
  "Everyone",
] as const;

const ATTRIBUTE_AREA_ITEM_IDS: Record<BandoriCardAttribute, number[]> = {
  powerful: [70, 56],
  cool: [66, 57],
  happy: [67, 58],
  pure: [69, 60],
};

const PARAMETER_AREA_ITEM_IDS = {
  performance: [80],
  technique: [81],
  visual: [82],
} as const;

const PARAMETER_KEYS = ["performance", "technique", "visual"] as const;

const JUDGE_RANK: Record<BandoriJudge, number> = {
  perfect: 0,
  great: 1,
  good: 2,
  bad: 3,
  miss: 4,
};

const JUDGE_PERCENT: Record<BandoriJudge, number> = {
  perfect: 1.1,
  great: 0.8,
  good: 0.5,
  bad: 0,
  miss: 0,
};

const SKILL_ORDER_PERMUTATIONS = buildPermutations([0, 1, 2, 3, 4]);

function toFiniteNumber(value: unknown, fallback = 0): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function toPositiveInteger(value: unknown, fallback: number): number {
  const numberValue = Math.trunc(toFiniteNumber(value, fallback));
  return numberValue > 0 ? numberValue : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getRegionalNumber(value: unknown, server: number): number {
  if (Array.isArray(value)) {
    return toFiniteNumber(value[server], toFiniteNumber(value[0], 0));
  }

  return toFiniteNumber(value, 0);
}

function buildPermutations(values: number[]): number[][] {
  if (values.length <= 1) {
    return [values];
  }

  return values.flatMap((value, index) => {
    const rest = [...values.slice(0, index), ...values.slice(index + 1)];
    return buildPermutations(rest).map((permutation) => [value, ...permutation]);
  });
}

function getComboMultiplier(combo: number): number {
  if (combo <= 20) {
    return 1;
  }
  if (combo <= 50) {
    return 1.01;
  }
  if (combo <= 100) {
    return 1.02;
  }
  if (combo <= 150) {
    return 1.03;
  }
  if (combo <= 200) {
    return 1.04;
  }
  if (combo <= 250) {
    return 1.05;
  }
  if (combo <= 300) {
    return 1.06;
  }
  if (combo <= 400) {
    return 1.07;
  }
  if (combo <= 500) {
    return 1.08;
  }
  if (combo <= 600) {
    return 1.09;
  }
  if (combo <= 700) {
    return 1.1;
  }
  return 1.11;
}

function getSongPlayLevel(song: BestdoriSongMaster, difficulty: BandoriTeamSearchDifficulty): number {
  return toPositiveInteger(song.difficulty?.[DIFFICULTY_INDEX[difficulty]]?.playLevel, 1);
}

function addChartNote(notes: Array<{ beat: number; skill: boolean }>, note: unknown): void {
  if (!isRecord(note)) {
    return;
  }

  const beat = toFiniteNumber(note.beat, Number.NaN);
  if (!Number.isFinite(beat)) {
    return;
  }

  notes.push({
    beat,
    skill: "skill" in note,
  });
}

function parseChartNotes(chart: BestdoriChartEntity[]): {
  notes: Array<{ beat: number; skill: boolean }>;
  bpms: Array<{ beat: number; bpm: number }>;
  feverStartBeat: number | null;
  feverEndBeat: number | null;
} {
  const notes: Array<{ beat: number; skill: boolean }> = [];
  const bpms: Array<{ beat: number; bpm: number }> = [];
  let feverStartBeat: number | null = null;
  let feverEndBeat: number | null = null;

  chart.forEach((entity) => {
    switch (entity.type) {
      case "Single":
      case "Directional":
        addChartNote(notes, entity);
        break;
      case "Long": {
        const connections = Array.isArray(entity.connections) ? entity.connections : [];
        addChartNote(notes, connections[0]);
        addChartNote(notes, connections[connections.length - 1]);
        break;
      }
      case "Slide": {
        const connections = Array.isArray(entity.connections) ? entity.connections : [];
        connections.forEach((connection, index) => {
          if (index > 0 && index < connections.length - 1 && isRecord(connection) && "hidden" in connection) {
            return;
          }
          addChartNote(notes, connection);
        });
        break;
      }
      case "BPM": {
        const beat = toFiniteNumber(entity.beat, Number.NaN);
        const bpm = toFiniteNumber(entity.bpm, Number.NaN);
        if (Number.isFinite(beat) && Number.isFinite(bpm) && bpm > 0) {
          bpms.push({ beat, bpm });
        }
        break;
      }
      case "System":
        if (entity.data === "cmd_fever_start.wav") {
          feverStartBeat = toFiniteNumber(entity.beat, 0);
        } else if (entity.data === "cmd_fever_end.wav") {
          feverEndBeat = toFiniteNumber(entity.beat, 0);
        }
        break;
      default:
        break;
    }
  });

  notes.sort((left, right) => (
    left.beat - right.beat
    || Number(right.skill) - Number(left.skill)
  ));

  bpms.sort((left, right) => left.beat - right.beat);
  return { notes, bpms, feverStartBeat, feverEndBeat };
}

export function prepareBandoriChart(
  chart: BestdoriChartEntity[],
  song: BestdoriSongMaster,
  difficulty: BandoriTeamSearchDifficulty,
): PreparedChart {
  const parsed = parseChartNotes(chart);
  let bpmIndex = 0;
  let currentBpm = 1;
  let currentTime = 0;
  let previousBeat = 0;
  const preparedNotes: PreparedNote[] = [];

  parsed.notes.forEach((note) => {
    while (bpmIndex < parsed.bpms.length && parsed.bpms[bpmIndex].beat < note.beat) {
      const bpm = parsed.bpms[bpmIndex];
      currentTime += (bpm.beat - previousBeat) * 60 / currentBpm;
      previousBeat = bpm.beat;
      currentBpm = bpm.bpm;
      bpmIndex += 1;
    }

    if (previousBeat < note.beat) {
      currentTime += (note.beat - previousBeat) * 60 / currentBpm;
      previousBeat = note.beat;
    }

    preparedNotes.push({
      beat: note.beat,
      time: currentTime,
      skill: note.skill,
      fever: parsed.feverStartBeat !== null
        && parsed.feverEndBeat !== null
        && note.beat > parsed.feverStartBeat
        && note.beat <= parsed.feverEndBeat,
    });
  });

  const skillStartNotes: number[] = [];
  const skillTriggerTimes: number[] = [];
  preparedNotes.forEach((note, index) => {
    if (!note.skill) {
      return;
    }

    skillStartNotes.push(index + 1);
    skillTriggerTimes.push(note.time);
  });

  return {
    notes: preparedNotes,
    playLevel: getSongPlayLevel(song, difficulty),
    notesCount: preparedNotes.length,
    skillStartNotes,
    skillTriggerTimes,
  };
}

function setPreparedChartFeverEnabled(chart: PreparedChart, enabled: boolean): PreparedChart {
  if (enabled) {
    return chart;
  }

  return {
    ...chart,
    notes: chart.notes.map((note) => ({
      ...note,
      fever: false,
    })),
  };
}

function getSkillEndNote(chart: PreparedChart, slotIndex: number, durationSeconds: number): number {
  const triggerTime = chart.skillTriggerTimes[slotIndex];
  if (triggerTime === undefined) {
    return chart.notesCount;
  }

  const endTime = triggerTime + durationSeconds + 0.00001;
  const endIndex = chart.notes.findIndex((note) => note.time > endTime);
  return endIndex === -1 ? chart.notesCount : endIndex;
}

function conditionMatches(effect: ResolvedBandoriScoreSkillEffect, judge: BandoriJudge): boolean {
  return effect.condition === "none" || JUDGE_RANK[judge] <= JUDGE_RANK[effect.condition];
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

  if (effect.type === "score_continued_note_judge") {
    const nextContinuedActive = continuedActive && conditionMatches(effect, judge);
    return {
      multiplier: nextContinuedActive ? 1 + (effect.valuePercent + rateUpBonusPercent) / 100 : 1,
      continuedActive: nextContinuedActive,
    };
  }

  if (conditionMatches(effect, judge)) {
    return {
      multiplier: 1 + (effect.valuePercent + rateUpBonusPercent) / 100,
      continuedActive,
    };
  }

  if (effect.type === "score_under_great_half") {
    return { multiplier: 0.5, continuedActive };
  }

  if (effect.type === "score_only_perfect") {
    return { multiplier: 0, continuedActive };
  }

  return { multiplier: 1, continuedActive };
}

function buildSkillMultiplierList(
  chart: PreparedChart,
  skill: ResolvedBandoriSkill | null,
  slotIndex: number,
  judgeList: readonly BandoriJudge[],
): Float64Array {
  const result = new Float64Array(chart.notesCount);
  result.fill(1);
  if (!skill || skill.scoreEffects.length === 0) {
    return result;
  }

  const start = chart.skillStartNotes[slotIndex] ?? chart.notesCount;
  const end = getSkillEndNote(chart, slotIndex, skill.durationSeconds);
  let continuedActive = true;
  let rateUpBonusPercent = 0;

  for (let noteIndex = start; noteIndex < end; noteIndex += 1) {
    const judge = judgeList[noteIndex] ?? "perfect";
    if (skill.hasRateUpWithPerfect && judge === "perfect") {
      rateUpBonusPercent = Math.min(50, rateUpBonusPercent + 0.5);
    }

    let multiplier = 1;
    for (const effect of skill.scoreEffects) {
      const next = getEffectMultiplier(effect, judge, continuedActive, rateUpBonusPercent);
      continuedActive = next.continuedActive;
      multiplier = Math.max(multiplier, next.multiplier);
    }
    result[noteIndex] = multiplier;
  }

  return result;
}

function buildJudgeList(notesCount: number, perfectRate: number): BandoriJudge[] {
  const normalizedPerfectRate = clamp(perfectRate, 0, 1);
  const perfectCount = Math.round(notesCount * normalizedPerfectRate);
  return Array.from({ length: notesCount }, (_, index) => (index < perfectCount ? "perfect" : "great"));
}

function buildInnerScoreList(
  chart: PreparedChart,
  bandPower: number,
  judgeList: readonly BandoriJudge[],
): Int32Array {
  const result = new Int32Array(chart.notesCount);
  if (chart.notesCount === 0 || bandPower <= 0) {
    return result;
  }

  const baseScore = 3 * bandPower * (1 + (chart.playLevel - 5) / 100) / chart.notesCount;
  for (let noteIndex = 0; noteIndex < chart.notesCount; noteIndex += 1) {
    const judge = judgeList[noteIndex] ?? "perfect";
    const note = chart.notes[noteIndex];
    result[noteIndex] = Math.floor(
      baseScore
      * JUDGE_PERCENT[judge]
      * getComboMultiplier(noteIndex + 1)
      * (note.fever ? 2 : 1),
    );
  }
  return result;
}

function skillSlotsCanUseAdditiveScore(chart: PreparedChart, maxDurationSeconds: number): boolean {
  let previousEndTime = Number.NEGATIVE_INFINITY;
  for (const triggerTime of chart.skillTriggerTimes) {
    if (triggerTime < previousEndTime) {
      return false;
    }
    previousEndTime = triggerTime + maxDurationSeconds + 0.00001;
  }
  return true;
}

function calculateSkillExtraContribution(
  chart: PreparedChart,
  skill: ResolvedBandoriSkill | null,
  slotIndex: number,
  judgeList: readonly BandoriJudge[],
  innerScores: Int32Array,
): number {
  if (!skill || skill.scoreEffects.length === 0) {
    return 0;
  }

  const multipliers = buildSkillMultiplierList(chart, skill, slotIndex, judgeList);
  let contribution = 0;
  for (let noteIndex = 0; noteIndex < chart.notesCount; noteIndex += 1) {
    contribution += Math.floor(innerScores[noteIndex] * Math.max(0, multipliers[noteIndex] - 1));
  }
  return contribution;
}

function calculateBestScoreForNonOverlappingSkillWindows(
  chart: PreparedChart,
  bandPower: number,
  skills: Array<ResolvedBandoriSkill | null>,
  perfectRate: number,
): {
  score: number;
  averageScore: number;
  minScore: number;
  maxScoreOrderCount: number;
  maxScoreOrderTotal: number;
  leaderIndex: number;
  permutation: number[];
} {
  const judgeList = buildJudgeList(chart.notesCount, perfectRate);
  const innerScores = buildInnerScoreList(chart, bandPower, judgeList);
  let baseScore = 0;
  innerScores.forEach((score) => {
    baseScore += score;
  });

  const contributions = skills.map((skill) => (
    Array.from({ length: 6 }, (_, slotIndex) => (
      calculateSkillExtraContribution(chart, skill, slotIndex, judgeList, innerScores)
    ))
  ));
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestLeaderIndex = 0;
  let bestPermutation = SKILL_ORDER_PERMUTATIONS[0];
  let bestLeaderAverageScore = 0;
  let bestLeaderMinScore = 0;
  let bestLeaderMaxScoreOrderCount = 0;

  for (let leaderIndex = 0; leaderIndex < skills.length; leaderIndex += 1) {
    const leaderContribution = contributions[leaderIndex][5];
    let leaderScoreSum = 0;
    let leaderMinScore = Number.POSITIVE_INFINITY;
    let leaderBestScore = Number.NEGATIVE_INFINITY;
    let leaderBestScoreOrderCount = 0;
    for (const permutation of SKILL_ORDER_PERMUTATIONS) {
      const score = permutation.reduce((sum, skillIndex, slotIndex) => (
        sum + contributions[skillIndex][slotIndex]
      ), baseScore + leaderContribution);
      leaderScoreSum += score;
      leaderMinScore = Math.min(leaderMinScore, score);
      if (score > leaderBestScore) {
        leaderBestScore = score;
        leaderBestScoreOrderCount = 1;
      } else if (score === leaderBestScore) {
        leaderBestScoreOrderCount += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestLeaderIndex = leaderIndex;
        bestPermutation = permutation;
        bestLeaderAverageScore = Math.round(leaderScoreSum / SKILL_ORDER_PERMUTATIONS.length);
        bestLeaderMinScore = leaderMinScore;
        bestLeaderMaxScoreOrderCount = leaderBestScoreOrderCount;
      }
    }
    if (leaderIndex === bestLeaderIndex && leaderBestScore === bestScore) {
      bestLeaderAverageScore = Math.round(leaderScoreSum / SKILL_ORDER_PERMUTATIONS.length);
      bestLeaderMinScore = leaderMinScore;
      bestLeaderMaxScoreOrderCount = leaderBestScoreOrderCount;
    }
  }

  return {
    score: bestScore,
    averageScore: bestLeaderAverageScore,
    minScore: bestLeaderMinScore,
    maxScoreOrderCount: bestLeaderMaxScoreOrderCount,
    maxScoreOrderTotal: SKILL_ORDER_PERMUTATIONS.length,
    leaderIndex: bestLeaderIndex,
    permutation: bestPermutation,
  };
}

function calculateScoreForSkillSequence(
  chart: PreparedChart,
  bandPower: number,
  skills: Array<ResolvedBandoriSkill | null>,
  perfectRate: number,
): number {
  if (chart.notesCount === 0 || bandPower <= 0) {
    return 0;
  }

  const judgeList = buildJudgeList(chart.notesCount, perfectRate);
  const innerScores = buildInnerScoreList(chart, bandPower, judgeList);
  const skillTotals = new Float64Array(chart.notesCount);
  const skillCache = new Map<string, Float64Array>();
  skills.forEach((skill, slotIndex) => {
    const key = `${slotIndex}:${skill?.cacheKey ?? "none"}`;
    let multipliers = skillCache.get(key);
    if (!multipliers) {
      multipliers = buildSkillMultiplierList(chart, skill, slotIndex, judgeList);
      skillCache.set(key, multipliers);
    }
    for (let noteIndex = 0; noteIndex < chart.notesCount; noteIndex += 1) {
      skillTotals[noteIndex] += multipliers[noteIndex];
    }
  });

  let score = 0;
  for (let noteIndex = 0; noteIndex < chart.notesCount; noteIndex += 1) {
    score += Math.floor(innerScores[noteIndex] * Math.max(0, skillTotals[noteIndex] - 5));
  }
  return score;
}

function calculateBaseScoreRatePerPower(chart: PreparedChart): number {
  if (chart.notesCount === 0) {
    return 0;
  }

  const baseScorePerPower = 3 * (1 + (chart.playLevel - 5) / 100) / chart.notesCount;
  return chart.notes.reduce((sum, note, index) => (
    sum + baseScorePerPower * JUDGE_PERCENT.perfect * getComboMultiplier(index + 1) * (note.fever ? 2 : 1)
  ), 0);
}

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

function getSkillDurationSeconds(skill: BestdoriSkillMaster | undefined, skillLevel: number, server: number): number {
  if (!skill) {
    return 0;
  }

  const normalizedSkillLevel = clamp(Math.trunc(skillLevel), 1, 5);
  return getRegionalNumber(
    Array.isArray(skill.duration) ? skill.duration[normalizedSkillLevel - 1] : skill.duration,
    server,
  ) ?? 0;
}

function calculateSkillUpperRatePerPower(
  chart: PreparedChart,
  skill: BestdoriSkillMaster | undefined,
  skillLevel: number,
  server: number,
): number {
  const valuePercent = getSkillMaxValuePercent(skill, server);
  const durationSeconds = getSkillDurationSeconds(skill, skillLevel, server);
  if (valuePercent <= 0 || durationSeconds <= 0 || chart.notesCount === 0) {
    return 0;
  }

  const baseScorePerPower = 3 * (1 + (chart.playLevel - 5) / 100) / chart.notesCount;
  let bestWindowRate = 0;
  for (let slotIndex = 0; slotIndex < 6; slotIndex += 1) {
    const start = chart.skillStartNotes[slotIndex] ?? chart.notesCount;
    const end = getSkillEndNote(chart, slotIndex, durationSeconds);
    let windowRate = 0;
    for (let noteIndex = start; noteIndex < end; noteIndex += 1) {
      const note = chart.notes[noteIndex];
      windowRate += baseScorePerPower * JUDGE_PERCENT.perfect * getComboMultiplier(noteIndex + 1) * (note.fever ? 2 : 1);
    }
    bestWindowRate = Math.max(bestWindowRate, windowRate);
  }

  return bestWindowRate * (valuePercent / 100);
}

function toAreaItemStateMap(areaItems: BandoriUserAreaItemState[]): Record<string, BandoriUserAreaItemState | undefined> {
  return Object.fromEntries(areaItems.map((item) => [String(item.areaItemId), item]));
}

function isOwnedAreaItem(userAreaItemsById: Record<string, BandoriUserAreaItemState | undefined>, areaItemId: number): boolean {
  return (userAreaItemsById[String(areaItemId)]?.level ?? 0) > 0;
}

function createAreaItemConfigurations(userAreaItems: BandoriUserAreaItemState[]): BandoriAreaItemConfiguration[] {
  const userAreaItemsById = toAreaItemStateMap(userAreaItems);
  const bandConfigs = BAND_AREA_ITEM_GROUP_KEYS
    .map((bandKey) => ({
      bandKey,
      selectedAreaItemIds: (BANDORI_AREA_ITEM_IDS_BY_GROUP[bandKey] ?? []).filter((areaItemId) => isOwnedAreaItem(userAreaItemsById, areaItemId)),
    }))
    .filter((config) => config.selectedAreaItemIds.length > 0);
  const attributeConfigs = (Object.entries(ATTRIBUTE_AREA_ITEM_IDS) as Array<[BandoriCardAttribute, number[]]>)
    .map(([attribute, areaItemIds]) => ({
      attribute,
      selectedAreaItemIds: areaItemIds.filter((areaItemId) => isOwnedAreaItem(userAreaItemsById, areaItemId)),
    }))
    .filter((config) => config.selectedAreaItemIds.length > 0);
  const parameterConfigs = (Object.entries(PARAMETER_AREA_ITEM_IDS) as Array<[keyof typeof PARAMETER_AREA_ITEM_IDS, readonly number[]]>)
    .map(([parameter, areaItemIds]) => ({
      parameter,
      selectedAreaItemIds: areaItemIds.filter((areaItemId) => isOwnedAreaItem(userAreaItemsById, areaItemId)),
    }))
    .filter((config) => config.selectedAreaItemIds.length > 0);
  const uniqueConfigs = new Map<string, BandoriAreaItemConfiguration>();

  for (const bandConfig of bandConfigs.length > 0 ? bandConfigs : [{ bandKey: null, selectedAreaItemIds: [] }]) {
    for (const attributeConfig of attributeConfigs.length > 0 ? attributeConfigs : [{ attribute: null, selectedAreaItemIds: [] }]) {
      for (const parameterConfig of [{ parameter: null, selectedAreaItemIds: [] }, ...parameterConfigs]) {
        const selectedAreaItemIds = [
          ...bandConfig.selectedAreaItemIds,
          ...attributeConfig.selectedAreaItemIds,
          ...parameterConfig.selectedAreaItemIds,
        ];
        const key = selectedAreaItemIds.slice().sort((left, right) => left - right).join(",");
        if (!uniqueConfigs.has(key)) {
          uniqueConfigs.set(key, {
            bandKey: bandConfig.bandKey,
            attribute: attributeConfig.attribute,
            parameter: parameterConfig.parameter,
            selectedAreaItemIds,
          });
        }
      }
    }
  }

  return [...uniqueConfigs.values()];
}

function getAreaItemBonusForCard(
  card: CalculatedBandoriCard,
  areaItemsById: Record<string, BestdoriAreaItemMaster | undefined>,
  userAreaItemsById: Record<string, BandoriUserAreaItemState | undefined>,
  selectedAreaItemIds: number[],
  server: number,
): number {
  return selectedAreaItemIds.reduce((power, areaItemId) => {
    const areaItem = areaItemsById[String(areaItemId)];
    const level = userAreaItemsById[String(areaItemId)]?.level ?? 0;
    if (!areaItem || level <= 0) {
      return power;
    }

    const targetAttributes = Array.isArray(areaItem.targetAttributes) ? areaItem.targetAttributes : [];
    const targetBandIds = Array.isArray(areaItem.targetBandIds) ? areaItem.targetBandIds.map((item) => Math.trunc(toFiniteNumber(item))) : [];
    if (!targetAttributes.includes(card.attribute) || card.bandId === null || !targetBandIds.includes(card.bandId)) {
      return power;
    }

    return power + PARAMETER_KEYS.reduce((sum, key, index) => (
      sum + card.characterParam[index] * (getRegionalNumber(areaItem[key]?.[String(level)], server) / 100)
    ), 0);
  }, 0);
}

function buildCalculatedCards(input: BandoriTeamSearchInput): CalculatedBandoriCard[] {
  const characterBonusesById = Object.fromEntries(
    input.characterBonuses.map((bonus) => [String(bonus.characterId), bonus]),
  );
  return input.userCards
    .filter((card) => !card.isExcluded)
    .flatMap((state) => {
      const card = input.cardsById[String(state.cardId)];
      if (!card) {
        return [];
      }
      return calculateBandoriCard(state, card, input.charactersById, characterBonusesById);
    });
}

function buildSearchCardsForConfiguration(
  cards: CalculatedBandoriCard[],
  input: BandoriTeamSearchInput,
  configuration: BandoriAreaItemConfiguration,
  chart: PreparedChart,
  server: number,
): SearchCard[] {
  const userAreaItemsById = toAreaItemStateMap(input.userAreaItems);
  return cards.map((card) => {
    const itemPower = getAreaItemBonusForCard(
      card,
      input.areaItemsById,
      userAreaItemsById,
      configuration.selectedAreaItemIds,
      server,
    );
    const eventBonus = calculateBandoriCardEventBonus(card, input.eventBonus);
    const eventPower = input.useSpecialRoomBonus
      ? PARAMETER_KEYS.reduce((sum, _, index) => sum + eventBonus.parameterBonusWithRoom[index], 0)
      : PARAMETER_KEYS.reduce((sum, _, index) => sum + eventBonus.parameterBonus[index], 0);
    return {
      ...card,
      effectivePower: card.totalPower + itemPower + eventPower,
      skillUpperRate: calculateSkillUpperRatePerPower(chart, input.skillsById[String(card.skillId)], card.skillLevel, server),
    };
  });
}

function buildSkillSearchSignature(
  skillId: number,
  skill: BestdoriSkillMaster | undefined,
  skillLevel: number,
  server: number,
): string {
  if (!skill) {
    return `${skillId}:${skillLevel}:missing`;
  }

  const normalizedSkillLevel = clamp(Math.trunc(skillLevel), 1, 5);
  const effects = Object.entries(skill.activationEffect?.activateEffectTypes ?? {})
    .filter(([type]) => type === "score_rate_up_with_perfect" || Boolean(getRegionalNumber(skill.activationEffect?.activateEffectTypes?.[type]?.activateEffectValue, server)))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([type, effect]) => [
      type,
      getRegionalNumber(effect.activateEffectValue, server) ?? 0,
      effect.activateCondition ?? "none",
      getRegionalNumber(effect.activateConditionLife, server) ?? 0,
    ].join("/"))
    .join("|");

  return [
    getSkillDurationSeconds(skill, normalizedSkillLevel, server),
    skill.activationEffect?.unificationActivateConditionBandId ?? "none",
    skill.activationEffect?.unificationActivateConditionType ?? "none",
    getRegionalNumber(skill.activationEffect?.unificationActivateEffectValue, server) ?? 0,
    effects,
  ].join(":");
}

function compressSearchCards(cards: SearchCard[], skillsById: Record<string, BestdoriSkillMaster | undefined>, server: number): SearchCard[] {
  const bestCards = new Map<string, SearchCard>();
  cards.forEach((card) => {
    const key = [
      card.characterId,
      card.bandId ?? "none",
      card.attribute,
      buildSkillSearchSignature(card.skillId, skillsById[String(card.skillId)], card.skillLevel, server),
    ].join(":");
    const current = bestCards.get(key);
    if (!current || card.effectivePower > current.effectivePower || (
      card.effectivePower === current.effectivePower && card.cardId > current.cardId
    )) {
      bestCards.set(key, card);
    }
  });

  return [...bestCards.values()].sort((left, right) => (
    right.effectivePower - left.effectivePower
    || right.totalPower - left.totalPower
    || left.cardId - right.cardId
  ));
}

function estimateRemainingPower(cards: SearchCard[], startIndex: number, usedCharacters: Set<number>, remaining: number): number {
  let total = 0;
  let count = 0;
  const seenCharacters = new Set<number>();
  for (let index = startIndex; index < cards.length && count < remaining; index += 1) {
    const card = cards[index];
    if (usedCharacters.has(card.characterId) || seenCharacters.has(card.characterId)) {
      continue;
    }
    seenCharacters.add(card.characterId);
    total += card.effectivePower;
    count += 1;
  }
  return count === remaining ? total : Number.NEGATIVE_INFINITY;
}

function estimateRemainingSkillRates(cards: SearchCard[], startIndex: number, usedCharacters: Set<number>, remaining: number): number[] {
  const rates: number[] = [];
  const seenCharacters = new Set<number>();
  for (let index = startIndex; index < cards.length; index += 1) {
    const card = cards[index];
    if (usedCharacters.has(card.characterId) || seenCharacters.has(card.characterId)) {
      continue;
    }
    seenCharacters.add(card.characterId);
    rates.push(card.skillUpperRate);
  }

  rates.sort((left, right) => right - left);
  return rates.slice(0, remaining);
}

function estimateSkillRateUpper(selectedCards: SearchCard[], remainingSkillRates: number[]): number {
  const rates = [
    ...selectedCards.map((card) => card.skillUpperRate),
    ...remainingSkillRates,
  ];
  if (rates.length === 0) {
    return 0;
  }

  const bestLeaderRate = Math.max(...rates);
  return rates
    .sort((left, right) => right - left)
    .slice(0, 5)
    .reduce((sum, rate) => sum + rate, bestLeaderRate);
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

function buildSeedTeams(cards: SearchCard[]): SearchCard[][] {
  const orderings = [
    cards,
    [...cards].sort((left, right) => (
      (right.effectivePower * (1 + right.skillUpperRate)) - (left.effectivePower * (1 + left.skillUpperRate))
      || right.effectivePower - left.effectivePower
      || left.cardId - right.cardId
    )),
    [...cards].sort((left, right) => (
      right.skillUpperRate - left.skillUpperRate
      || right.effectivePower - left.effectivePower
      || left.cardId - right.cardId
    )),
  ];
  const seen = new Set<string>();
  const teams: SearchCard[][] = [];

  for (const ordering of orderings) {
    const team = pickFirstDistinctCharacterCards(ordering);
    if (!team) {
      continue;
    }
    const key = team.map((card) => card.cardId).sort((left, right) => left - right).join(",");
    if (!seen.has(key)) {
      seen.add(key);
      teams.push(team);
    }
  }

  return teams;
}

function sortResults(results: BandoriTeamSearchResult[]): void {
  results.sort((left, right) => (
    right.score - left.score
    || right.totalPower - left.totalPower
    || right.skills[0].skillId - left.skills[0].skillId
    || left.cards.map((card) => card.cardId).join(",").localeCompare(right.cards.map((card) => card.cardId).join(","))
  ));
  results.forEach((result, index) => {
    result.rank = index + 1;
  });
}

function toResultCards(cards: CalculatedBandoriCard[]): BandoriTeamSearchResultCard[] {
  return cards.map((card) => ({
    cardId: card.cardId,
    characterId: card.characterId,
    bandId: card.bandId,
    attribute: card.attribute,
    rarity: card.rarity,
    skillId: card.skillId,
    skillLevel: card.skillLevel,
    level: card.level,
    masterRank: card.masterRank,
    totalPower: card.totalPower,
  }));
}

function getBaseCardPower(card: CalculatedBandoriCard): number {
  return card.baseParam[0] + card.baseParam[1] + card.baseParam[2];
}

function evaluateTeam(
  cards: SearchCard[],
  input: BandoriTeamSearchInput,
  chart: PreparedChart,
  configuration: BandoriAreaItemConfiguration,
  server: number,
  perfectRate: number,
): BandoriTeamSearchResult | null {
  const context = getBandoriTeamContext(cards, Object.fromEntries(
    cards.map((card) => [String(card.characterId), { bandId: card.bandId }]),
  ));
  const resolvedSkills = cards.map((card) => {
    const skill = input.skillsById[String(card.skillId)];
    return skill ? resolveBandoriSkill(card.skillId, skill, card.skillLevel, context, server) : null;
  });
  const cardPower = cards.reduce((sum, card) => sum + card.totalPower, 0);
  const baseCardPower = cards.reduce((sum, card) => sum + getBaseCardPower(card), 0);
  const userAreaItemsById = toAreaItemStateMap(input.userAreaItems);
  const areaItemResult = calculateBandoriSelectedAreaItemPower(
    cards,
    input.areaItemsById,
    userAreaItemsById,
    configuration.selectedAreaItemIds,
    server,
  );
  const eventBonuses = cards.map((card) => calculateBandoriCardEventBonus(card, input.eventBonus));
  const eventPower = Math.floor(eventBonuses.reduce((sum, bonus) => (
    sum + bonus.parameterBonus[0] + bonus.parameterBonus[1] + bonus.parameterBonus[2]
  ), 0));
  const eventPowerWithRoom = Math.floor(eventBonuses.reduce((sum, bonus) => (
    sum + bonus.parameterBonusWithRoom[0] + bonus.parameterBonusWithRoom[1] + bonus.parameterBonusWithRoom[2]
  ), 0));
  const pointBonusRate = Math.round(eventBonuses.reduce((sum, bonus) => sum + bonus.pointBonusRate, 0) * 100) / 100;
  const activeEventPower = input.useSpecialRoomBonus ? eventPowerWithRoom : eventPower;
  const totalPower = cardPower + areaItemResult.power + activeEventPower;
  const maxDurationSeconds = resolvedSkills.reduce((max, skill) => Math.max(max, skill?.durationSeconds ?? 0), 0);
  let best = skillSlotsCanUseAdditiveScore(chart, maxDurationSeconds)
    ? calculateBestScoreForNonOverlappingSkillWindows(chart, totalPower, resolvedSkills, perfectRate)
    : null;

  if (!best) {
    let bestScore = Number.NEGATIVE_INFINITY;
    let bestLeaderIndex = 0;
    let bestPermutation = SKILL_ORDER_PERMUTATIONS[0];
    let bestLeaderAverageScore = 0;
    let bestLeaderMinScore = 0;
    let bestLeaderMaxScoreOrderCount = 0;

    for (let leaderIndex = 0; leaderIndex < cards.length; leaderIndex += 1) {
      let leaderScoreSum = 0;
      let leaderMinScore = Number.POSITIVE_INFINITY;
      let leaderBestScore = Number.NEGATIVE_INFINITY;
      let leaderBestScoreOrderCount = 0;
      for (const permutation of SKILL_ORDER_PERMUTATIONS) {
        const skillSequence = [
          ...permutation.map((cardIndex) => resolvedSkills[cardIndex]),
          resolvedSkills[leaderIndex],
        ];
        const score = calculateScoreForSkillSequence(chart, totalPower, skillSequence, perfectRate);
        leaderScoreSum += score;
        leaderMinScore = Math.min(leaderMinScore, score);
        if (score > leaderBestScore) {
          leaderBestScore = score;
          leaderBestScoreOrderCount = 1;
        } else if (score === leaderBestScore) {
          leaderBestScoreOrderCount += 1;
        }
        if (score > bestScore) {
          bestScore = score;
          bestLeaderIndex = leaderIndex;
          bestPermutation = permutation;
          bestLeaderAverageScore = Math.round(leaderScoreSum / SKILL_ORDER_PERMUTATIONS.length);
          bestLeaderMinScore = leaderMinScore;
          bestLeaderMaxScoreOrderCount = leaderBestScoreOrderCount;
        }
      }
      if (leaderIndex === bestLeaderIndex && leaderBestScore === bestScore) {
        bestLeaderAverageScore = Math.round(leaderScoreSum / SKILL_ORDER_PERMUTATIONS.length);
        bestLeaderMinScore = leaderMinScore;
        bestLeaderMaxScoreOrderCount = leaderBestScoreOrderCount;
      }
    }

    best = {
      score: bestScore,
      averageScore: bestLeaderAverageScore,
      minScore: bestLeaderMinScore,
      maxScoreOrderCount: bestLeaderMaxScoreOrderCount,
      maxScoreOrderTotal: SKILL_ORDER_PERMUTATIONS.length,
      leaderIndex: bestLeaderIndex,
      permutation: bestPermutation,
    };
  }

  if (!Number.isFinite(best.score)) {
    return null;
  }

  const skillOrderCardIds = [
    ...best.permutation.map((cardIndex) => cards[cardIndex].cardId),
    cards[best.leaderIndex].cardId,
  ];

  return {
    rank: 0,
    score: best.averageScore,
    averageScore: best.averageScore,
    maxScore: best.score,
    minScore: best.minScore,
    maxScoreOrderCount: best.maxScoreOrderCount,
    maxScoreOrderTotal: best.maxScoreOrderTotal,
    totalPower,
    rawCardPower: baseCardPower,
    areaItemPower: areaItemResult.power,
    eventPower,
    eventPowerWithRoom,
    pointBonusRate,
    leaderCardId: cards[best.leaderIndex].cardId,
    skillOrderCardIds,
    areaItemConfiguration: {
      ...configuration,
      selectedAreaItemIds: areaItemResult.selectedAreaItemIds,
    },
    context,
    cards: toResultCards(cards),
    skills: cards.map((card, index) => ({
      cardId: card.cardId,
      skillId: card.skillId,
      skillLevel: card.skillLevel,
      resolvedSkill: resolvedSkills[index],
    })),
  };
}

function pushResult(results: BandoriTeamSearchResult[], result: BandoriTeamSearchResult, resultLimit: number): void {
  results.push(result);
  sortResults(results);
  if (results.length > resultLimit) {
    results.pop();
  }
}

export function searchBandoriBestTeams(input: BandoriTeamSearchInput): BandoriTeamSearchResponse {
  const startedAt = performance.now();
  const server = input.server ?? 3;
  const resultLimit = clamp(Math.trunc(input.resultLimit ?? 10), 1, 50);
  const perfectRate = clamp(input.perfectRate ?? 1, 0, 1);
  const maxSearchDurationMs = Math.max(1000, Math.trunc(input.maxSearchDurationMs ?? 9000));
  const deadlineAt = startedAt + maxSearchDurationMs;
  const chart = setPreparedChartFeverEnabled(
    prepareBandoriChart(input.chart, input.song, input.difficulty),
    input.useFever === true,
  );
  const calculatedCards = buildCalculatedCards(input);
  const configurations = createAreaItemConfigurations(input.userAreaItems);
  const results: BandoriTeamSearchResult[] = [];
  const stats: BandoriTeamSearchStats = {
    candidateCardCount: calculatedCards.length,
    compressedCandidateCount: 0,
    areaItemConfigurationCount: configurations.length,
    enumeratedTeamCount: 0,
    prunedBranchCount: 0,
    elapsedMs: 0,
    usedEventBonus: Boolean(input.eventBonus),
    isExhaustive: true,
    timedOut: false,
    searchMode: "exact",
  };

  if (calculatedCards.length < 5 || chart.notesCount === 0) {
    return {
      results: [],
      stats: {
        ...stats,
        elapsedMs: Math.round(performance.now() - startedAt),
      },
    };
  }

  const baseScoreRatePerPower = calculateBaseScoreRatePerPower(chart);
  let visitedBranchCount = 0;
  const isPastDeadline = (): boolean => {
    visitedBranchCount += 1;
    return visitedBranchCount % 2048 === 0 && performance.now() >= deadlineAt;
  };
  const configurationSearches: SearchConfiguration[] = [];

  for (const configuration of configurations) {
    if (performance.now() >= deadlineAt) {
      stats.isExhaustive = false;
      stats.timedOut = true;
      stats.searchMode = "bounded";
      break;
    }

    const searchCards = compressSearchCards(
      buildSearchCardsForConfiguration(calculatedCards, input, configuration, chart, server),
      input.skillsById,
      server,
    );
    stats.compressedCandidateCount += searchCards.length;
    let seedScore = Number.NEGATIVE_INFINITY;

    for (const seedTeam of buildSeedTeams(searchCards)) {
      stats.enumeratedTeamCount += 1;
      const result = evaluateTeam(seedTeam, input, chart, configuration, server, perfectRate);
      if (result) {
        seedScore = Math.max(seedScore, result.score);
        pushResult(results, result, resultLimit);
      }
    }

    configurationSearches.push({
      configuration,
      searchCards,
      seedScore,
    });
  }

  configurationSearches.sort((left, right) => (
    right.seedScore - left.seedScore
    || (right.searchCards[0]?.effectivePower ?? 0) - (left.searchCards[0]?.effectivePower ?? 0)
    || right.searchCards.length - left.searchCards.length
  ));

  for (const search of configurationSearches) {
    if (performance.now() >= deadlineAt) {
      stats.isExhaustive = false;
      stats.timedOut = true;
      stats.searchMode = "bounded";
      break;
    }

    const { configuration, searchCards } = search;
    const selectedCards: SearchCard[] = [];
    const usedCharacters = new Set<number>();

    const visit = (startIndex: number): void => {
      if (stats.timedOut || isPastDeadline()) {
        stats.isExhaustive = false;
        stats.timedOut = true;
        stats.searchMode = "bounded";
        return;
      }

      const remaining = 5 - selectedCards.length;
      if (remaining === 0) {
        stats.enumeratedTeamCount += 1;
        const result = evaluateTeam(selectedCards, input, chart, configuration, server, perfectRate);
        if (result) {
          pushResult(results, result, resultLimit);
        }
        return;
      }

      if (searchCards.length - startIndex < remaining) {
        return;
      }

      if (results.length >= resultLimit) {
        const currentPower = selectedCards.reduce((sum, card) => sum + card.effectivePower, 0);
        const remainingPower = estimateRemainingPower(searchCards, startIndex, usedCharacters, remaining);
        const upperPower = currentPower + remainingPower;
        const skillRateUpper = estimateSkillRateUpper(
          selectedCards,
          estimateRemainingSkillRates(searchCards, startIndex, usedCharacters, remaining),
        );
        const threshold = results[resultLimit - 1]?.score ?? Number.NEGATIVE_INFINITY;
        if (!Number.isFinite(upperPower) || Math.floor(upperPower) * (baseScoreRatePerPower + skillRateUpper) < threshold) {
          stats.prunedBranchCount += 1;
          return;
        }
      }

      for (let index = startIndex; index < searchCards.length; index += 1) {
        const card = searchCards[index];
        if (usedCharacters.has(card.characterId)) {
          continue;
        }

        selectedCards.push(card);
        usedCharacters.add(card.characterId);
        visit(index + 1);
        usedCharacters.delete(card.characterId);
        selectedCards.pop();
        if (stats.timedOut) {
          return;
        }
      }
    };

    visit(0);
  }

  sortResults(results);
  return {
    results,
    stats: {
      ...stats,
      elapsedMs: Math.round(performance.now() - startedAt),
    },
  };
}

export function isBandoriTeamSearchDifficulty(value: string): value is BandoriTeamSearchDifficulty {
  return (BANDORI_TEAM_SEARCH_DIFFICULTIES as readonly string[]).includes(value);
}
