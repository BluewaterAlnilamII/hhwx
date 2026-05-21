import {
  BANDORI_AREA_ITEM_IDS_BY_GROUP,
} from "@/lib/bandori-area-item-groups";
import {
  calculateBandoriCard,
  calculateBandoriCardEventBonus,
  calculateBandoriRoundedParamBonusPower,
  calculateBandoriSupportCardEventBonus,
  calculateBandoriSelectedAreaItemPower,
  resolveBandoriSkill,
  type BandoriCardAttribute,
  type BandoriCharacterBonusState,
  type BandoriEventBonus,
  type BandoriJudge,
  type BandoriTeamContext,
  type BandoriUserAreaItemState,
  type BandoriUserCardState,
  type BestdoriAreaItemMaster,
  type BestdoriCardMaster,
  type BestdoriSkillMaster,
  type CalculatedBandoriCard,
  type ResolvedBandoriScoreSkillEffect,
  type ResolvedBandoriSkill,
} from "@/lib/bandori-team-calculator";

/*
 * Bandori 单曲 exact 搜索核心。
 *
 * 本模块同时处理谱面计分、活动 PT、支援队伍和 branch-and-bound 搜索。
 * 所有剪枝只能使用乐观上界；排序和 seed 可以启发式，但不能删除可能最优的解。
 */

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

export type BandoriTeamSearchSupportCard = BandoriTeamSearchResultCard & {
  supportPower: number;
};

export type BandoriTeamSearchEventPointOption = {
  key: string;
  eventPoint: number;
  eventPointBase: number;
  multiplier: number;
  liveBoostCount?: 0 | 1 | 2 | 3;
  challengeCpCost?: 200 | 400 | 800 | 1600;
  placement?: 1 | 2 | 3 | 4 | 5;
  festivalResult?: "win" | "lose";
};

export type BandoriTeamSearchEventPointOptions = {
  mode: "none" | "liveBoost" | "challengeCp" | "versus" | "festival";
  defaultKey: string | null;
  options: BandoriTeamSearchEventPointOption[];
};

export type BandoriTeamSearchSkillOrderActor = "self" | "other1" | "other2" | "other3" | "other4";

export type BandoriTeamSearchResult = {
  rank: number;
  score: number;
  targetValue: number;
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
  eventPointBase: number | null;
  eventPointMultiplier: number;
  eventPoint: number | null;
  eventPointOptions: BandoriTeamSearchEventPointOptions;
  eventMode: BandoriTeamSearchEventMode;
  roomScore: number | null;
  supportBandPower: number | null;
  supportCards: BandoriTeamSearchSupportCard[];
  liveType: BandoriTeamSearchLiveType;
  eventType: BandoriTeamSearchEventType;
  target: BandoriTeamSearchTarget;
  leaderCardId: number;
  skillOrderCardIds: number[];
  skillOrderActors?: BandoriTeamSearchSkillOrderActor[];
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
  rawAreaItemConfigurationCount: number;
  compressedCandidateCount: number;
  areaItemConfigurationCount: number;
  prunedAreaItemConfigurationCount: number;
  enumeratedTeamCount: number;
  evaluatedTeamCount: number;
  targetOnlyEvaluationCount: number;
  hydratedResultCount: number;
  skippedHydrationCount: number;
  duplicateTeamCount: number;
  prunedBranchCount: number;
  elapsedMs: number;
  usedEventBonus: boolean;
  eventMode: BandoriTeamSearchEventMode;
  useFever: boolean;
  supportBandEnabled: boolean;
  supportCandidateCount: number;
  supportEvaluationCount: number;
  skippedSupportByUpperBoundCount: number;
  supportBandPowerUpperBound: number | null;
  supportAwareCompressionPrunedCount: number;
  tightUpperBoundCount: number;
  tightUpperBoundPrunedBranchCount: number;
  secondLevelBoundCount: number;
  secondLevelPrunedCount: number;
  rootConfigSkippedCount: number;
  isExhaustive: boolean;
  timedOut: boolean;
  searchMode: "exact" | "bounded";
  observedScoreUpperBound: number | null;
  observedScoreUpperBoundGap: number | null;
};

export type BandoriTeamSearchResponse = {
  results: BandoriTeamSearchResult[];
  stats: BandoriTeamSearchStats;
};

export type BandoriTeamSearchEventType =
  | "none"
  | "story"
  | "challenge"
  | "versus"
  | "live_try"
  | "mission_live"
  | "festival"
  | "medley";

export type BandoriTeamSearchLiveType = "free" | "multi" | "challenge" | "versus";

export type BandoriTeamSearchTarget = "score" | "eventPoint";

export type BandoriTeamSearchEventMode = "none" | "parameterPower" | "pointBonus";

export type BandoriTeamSearchExternalSkill = {
  skillId: number;
  skillLevel: number;
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
  chartCacheKey?: string;
  song: BestdoriSongMaster;
  difficulty: BandoriTeamSearchDifficulty;
  eventBonus?: BandoriEventBonus | null;
  resultLimit?: number;
  perfectRate?: number;
  useFever?: boolean;
  useSpecialRoomBonus?: boolean;
  eventType?: BandoriTeamSearchEventType;
  eventFormula?: 0 | 1 | 2;
  liveType?: BandoriTeamSearchLiveType;
  target?: BandoriTeamSearchTarget;
  roomPower?: number;
  otherPlayersAveragePower?: number;
  otherPlayerSkills?: BandoriTeamSearchExternalSkill[];
  encoreSkillSource?: "self" | "other1" | "other2" | "other3" | "other4";
  liveBoostCount?: 0 | 1 | 2 | 3;
  challengeCpCost?: 200 | 400 | 800 | 1600;
  server?: number;
  maxSearchDurationMs?: number;
};

export type SearchCard = CalculatedBandoriCard & {
  effectivePower: number;
  pointBonusRate: number;
  skillUpperRate: number;
  skillAverageRate: number;
  skillLeaderRate: number;
  skillSameBandAverageRate: number;
  skillSameBandLeaderRate: number;
  skillSameAttributeAverageRate: number;
  skillSameAttributeLeaderRate: number;
  skillBothAverageRate: number;
  skillBothLeaderRate: number;
  skillMixedAverageRate: number;
  skillMixedLeaderRate: number;
  supportPower: number;
  skillSearchSignature: string;
};

export type SearchCardSkillRateProfile = Pick<
  SearchCard,
  | "skillUpperRate"
  | "skillAverageRate"
  | "skillLeaderRate"
  | "skillSameBandAverageRate"
  | "skillSameBandLeaderRate"
  | "skillSameAttributeAverageRate"
  | "skillSameAttributeLeaderRate"
  | "skillBothAverageRate"
  | "skillBothLeaderRate"
  | "skillMixedAverageRate"
  | "skillMixedLeaderRate"
>;

type SearchConfiguration = {
  configuration: BandoriAreaItemConfiguration;
  searchCards: SearchCard[];
  upperBoundIndex: CharacterUpperBoundIndex;
  seedScore: number;
  seedTargetValue: number;
  rootScoreUpperBound: number;
  rootTargetUpperBound: number;
  skillContextUpperMode?: SkillContextUpperMode;
};

type SearchScope = {
  searchCards: SearchCard[];
  skillContextUpperMode?: SkillContextUpperMode;
};

type SearchCardGroup = {
  characterId: number;
  characterIndex: number;
  startIndex: number;
  cards: SearchCard[];
};

type SupportBandCandidate = {
  card: CalculatedBandoriCard;
  supportPower: number;
};

type SupportBandSelection = {
  supportBandPower: number;
  supportCards: SupportBandCandidate[];
};

type SupportBandContext = {
  enabled: boolean;
  candidates: SupportBandCandidate[];
  supportPowerByCardId: Map<number, number>;
  supportBandPowerUpperBound: number;
  supportBandPointUpperBound: number;
  evaluationCount: number;
  skippedByUpperBoundCount: number;
  selectionCache: Map<string, SupportBandSelection>;
};

type SearchCardStaticProfile = SearchCardSkillRateProfile & {
  skillSignature: string;
  pointBonusRate: number;
  supportPower: number;
  eventPower: number;
};

type SearchPrecomputedData = {
  cardIndexById: Map<number, number>;
  cardStaticProfilesById: Map<number, SearchCardStaticProfile>;
  areaItemPowerByConfigurationKey: Map<string, Float64Array>;
};

type SearchObjectiveMode = "score" | "event-point" | "mission-event-point";

type SearchObjectiveAdapter = {
  mode: SearchObjectiveMode;
  target: BandoriTeamSearchTarget;
  eventMode: BandoriTeamSearchEventMode;
  usesPointBonus: boolean;
  usesMissionSupport: boolean;
  supportBandPointUpperBound: number;
  maxSeedTeams: number;
  compressionDominates: (left: SearchCard, right: SearchCard) => boolean;
  getTraversalValue: (card: SearchCard, baseScoreRatePerPower: number) => number;
  getSeedTeamSortValue: (cards: SearchCard[]) => number;
  estimateTargetUpperBound: (
    scoreUpperBound: number,
    pointBonusRateUpper: number,
    input: BandoriTeamSearchInput,
    scoreRateUpper?: number,
  ) => number;
};

export type CharacterUpperBoundIndex = {
  characterIds: number[];
  characterIndexById: Map<number, number>;
  characterBandIds: Array<number | null>;
  bandIds: number[];
  powerByStartIndex: Float64Array[];
  pointBonusRateByStartIndex: Float64Array[];
  skillAverageRateByStartIndex: Float64Array[];
  skillLeaderRateByStartIndex: Float64Array[];
  skillSameBandAverageRateByStartIndex: Float64Array[];
  skillSameBandLeaderRateByStartIndex: Float64Array[];
  skillSameAttributeAverageRateByStartIndex: Float64Array[];
  skillSameAttributeLeaderRateByStartIndex: Float64Array[];
  skillBothAverageRateByStartIndex: Float64Array[];
  skillBothLeaderRateByStartIndex: Float64Array[];
  skillMixedAverageRateByStartIndex: Float64Array[];
  skillMixedLeaderRateByStartIndex: Float64Array[];
};

export type SkillContextUpperMode = "optimistic" | "same-band" | "same-attribute" | "both" | "mixed";

type SkillUpperRates = {
  maxRate: number;
  averageRate: number;
  leaderRate: number;
};

export type ScoreCalculationCache = {
  judgeLists?: Map<string, BandoriJudge[]>;
  innerScoreRates?: Map<string, Float64Array>;
  noFloorBaseScoreRates?: Map<string, number>;
  skillMultiplierLists: Map<string, Float64Array>;
  noFloorSkillRates: Map<string, SkillUpperRates>;
  resolvedSkills?: Map<string, ResolvedBandoriSkill | null>;
};

type PreparedNote = {
  beat: number;
  time: number;
  skill: boolean;
  fever: boolean;
};

export type PreparedChart = {
  notes: PreparedNote[];
  playLevel: number;
  notesCount: number;
  skillStartNotes: number[];
  skillTriggerTimes: number[];
};

export type ScoreComboOptions = {
  startCombo?: number;
  useMedleyCombo?: boolean;
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

const ATTRIBUTE_KEYS = Object.keys(ATTRIBUTE_AREA_ITEM_IDS) as BandoriCardAttribute[];

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

const SCORE_FLOOR_EPSILON = 1e-5;
const SKILL_ORDER_PERMUTATIONS = buildPermutations([0, 1, 2, 3, 4]);

// 这些缓存只保存 master/chart 派生的纯计算结果，不能缓存带用户隐私的档案 payload。
const PREPARED_CHART_CACHE_LIMIT = 64;
const preparedChartCache = new Map<string, PreparedChart>();
const SKILL_RATE_PROFILE_CACHE_LIMIT = 20000;
const skillRateProfileCache = new Map<string, SearchCardSkillRateProfile>();

function toFiniteNumber(value: unknown, fallback = 0): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function toPositiveInteger(value: unknown, fallback: number): number {
  const numberValue = Math.trunc(toFiniteNumber(value, fallback));
  return numberValue > 0 ? numberValue : fallback;
}

export function clamp(value: number, min: number, max: number): number {
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

export function buildPermutations(values: number[]): number[][] {
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

function getMedleyComboMultiplier(combo: number): number {
  if (combo <= 20) {
    return 1;
  }
  if (combo <= 50) {
    return 1.01;
  }
  if (combo <= 100) {
    return 1.02;
  }
  if (combo <= 300) {
    return 1.01 + Math.floor((combo - 1) / 50) * 0.01;
  }
  if (combo <= 3000) {
    return 1.04 + Math.floor((combo - 1) / 100) * 0.01;
  }
  return 1.34;
}

function getScoreComboMultiplier(noteIndex: number, options?: ScoreComboOptions): number {
  const combo = (options?.startCombo ?? 0) + noteIndex + 1;
  return options?.useMedleyCombo ? getMedleyComboMultiplier(combo) : getComboMultiplier(combo);
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
        && note.beat >= parsed.feverStartBeat
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

export function getCachedPreparedChart(input: BandoriTeamSearchInput): PreparedChart {
  const useFever = resolveBandoriTeamSearchUseFever(input);
  const cacheKey = input.chartCacheKey
    ? `${input.chartCacheKey}:fever=${useFever ? "1" : "0"}`
    : null;
  if (cacheKey) {
    const cached = preparedChartCache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const chart = setPreparedChartFeverEnabled(
    prepareBandoriChart(input.chart, input.song, input.difficulty),
    useFever,
  );
  if (cacheKey) {
    preparedChartCache.set(cacheKey, chart);
    if (preparedChartCache.size > PREPARED_CHART_CACHE_LIMIT) {
      const oldestKey = preparedChartCache.keys().next().value;
      if (oldestKey) {
        preparedChartCache.delete(oldestKey);
      }
    }
  }
  return chart;
}

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

// 当前准率模型把非 PERFECT 统一视为 GREAT，因此 GREAT 以下打断不会在期望分路径触发。
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

type SkillWindowScoreResult = {
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

// 技能窗不重叠时，技能到窗口的分配可用 bitmask DP 精确等价替代 5! 全排列。
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

function calculateBestMultiLiveScoreForSkillWindows(
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

function calculateBestScoreForNonOverlappingSkillWindows(
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

function calculateSkillUpperRatesPerPower(
  chart: PreparedChart,
  skill: BestdoriSkillMaster | undefined,
  skillLevel: number,
  server: number,
  comboOptions?: ScoreComboOptions,
): SkillUpperRates {
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

function calculateResolvedSkillUpperRatesPerPower(
  chart: PreparedChart,
  skill: ResolvedBandoriSkill | null,
  comboOptions?: ScoreComboOptions,
): SkillUpperRates {
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

function toAreaItemStateMap(areaItems: BandoriUserAreaItemState[]): Record<string, BandoriUserAreaItemState | undefined> {
  return Object.fromEntries(areaItems.map((item) => [String(item.areaItemId), item]));
}

function isOwnedAreaItem(userAreaItemsById: Record<string, BandoriUserAreaItemState | undefined>, areaItemId: number): boolean {
  return (userAreaItemsById[String(areaItemId)]?.level ?? 0) > 0;
}

export function createAreaItemConfigurations(userAreaItems: BandoriUserAreaItemState[]): BandoriAreaItemConfiguration[] {
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

function getAreaItemConfigurationKey(configuration: BandoriAreaItemConfiguration): string {
  return configuration.selectedAreaItemIds.slice().sort((left, right) => left - right).join(",");
}

function buildSearchCardSkillRateProfile(
  card: CalculatedBandoriCard,
  input: BandoriTeamSearchInput,
  chart: PreparedChart,
  server: number,
  comboOptions?: ScoreComboOptions,
): SearchCardSkillRateProfile {
  const skillUpperRates = calculateSkillUpperRatesPerPower(
    chart,
    input.skillsById[String(card.skillId)],
    card.skillLevel,
    server,
    comboOptions,
  );
  const mixedContext: BandoriTeamContext = {
    sameBandId: null,
    sameAttribute: null,
  };
  const skill = input.skillsById[String(card.skillId)];
  const sameBandContext: BandoriTeamContext = {
    sameBandId: card.bandId,
    sameAttribute: null,
  };
  const sameAttributeContext: BandoriTeamContext = {
    sameBandId: null,
    sameAttribute: card.attribute,
  };
  const bothContext: BandoriTeamContext = {
    sameBandId: card.bandId,
    sameAttribute: card.attribute,
  };
  const sameBandSkillUpperRates = calculateResolvedSkillUpperRatesPerPower(
    chart,
    skill ? resolveBandoriSkill(card.skillId, skill, card.skillLevel, sameBandContext, server) : null,
    comboOptions,
  );
  const sameAttributeSkillUpperRates = calculateResolvedSkillUpperRatesPerPower(
    chart,
    skill ? resolveBandoriSkill(card.skillId, skill, card.skillLevel, sameAttributeContext, server) : null,
    comboOptions,
  );
  const bothSkillUpperRates = calculateResolvedSkillUpperRatesPerPower(
    chart,
    skill ? resolveBandoriSkill(card.skillId, skill, card.skillLevel, bothContext, server) : null,
    comboOptions,
  );
  const mixedSkillUpperRates = calculateResolvedSkillUpperRatesPerPower(
    chart,
    skill ? resolveBandoriSkill(card.skillId, skill, card.skillLevel, mixedContext, server) : null,
    comboOptions,
  );

  return {
    skillUpperRate: skillUpperRates.maxRate,
    skillAverageRate: skillUpperRates.averageRate,
    skillLeaderRate: skillUpperRates.leaderRate,
    skillSameBandAverageRate: sameBandSkillUpperRates.averageRate,
    skillSameBandLeaderRate: sameBandSkillUpperRates.leaderRate,
    skillSameAttributeAverageRate: sameAttributeSkillUpperRates.averageRate,
    skillSameAttributeLeaderRate: sameAttributeSkillUpperRates.leaderRate,
    skillBothAverageRate: bothSkillUpperRates.averageRate,
    skillBothLeaderRate: bothSkillUpperRates.leaderRate,
    skillMixedAverageRate: mixedSkillUpperRates.averageRate,
    skillMixedLeaderRate: mixedSkillUpperRates.leaderRate,
  };
}

function getSkillRateProfileCacheKey(
  card: CalculatedBandoriCard,
  input: BandoriTeamSearchInput,
  server: number,
  comboOptions?: ScoreComboOptions,
): string | null {
  if (!input.chartCacheKey) {
    return null;
  }

  return [
    input.chartCacheKey,
    resolveBandoriTeamSearchUseFever(input) ? "fever" : "no-fever",
    server,
    comboOptions?.startCombo ?? 0,
    comboOptions?.useMedleyCombo ? 1 : 0,
    card.skillId,
    card.skillLevel,
    card.bandId ?? "none",
    card.attribute,
  ].join(":");
}

function getCachedSearchCardSkillRateProfile(
  card: CalculatedBandoriCard,
  input: BandoriTeamSearchInput,
  chart: PreparedChart,
  server: number,
  comboOptions?: ScoreComboOptions,
): SearchCardSkillRateProfile {
  const cacheKey = getSkillRateProfileCacheKey(card, input, server, comboOptions);
  if (cacheKey) {
    const cached = skillRateProfileCache.get(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const profile = buildSearchCardSkillRateProfile(card, input, chart, server, comboOptions);
  if (cacheKey) {
    skillRateProfileCache.set(cacheKey, profile);
    if (skillRateProfileCache.size > SKILL_RATE_PROFILE_CACHE_LIMIT) {
      const oldestKey = skillRateProfileCache.keys().next().value;
      if (oldestKey) {
        skillRateProfileCache.delete(oldestKey);
      }
    }
  }

  return profile;
}

export function buildSearchCardSkillRateProfiles(
  cards: CalculatedBandoriCard[],
  input: BandoriTeamSearchInput,
  chart: PreparedChart,
  server: number,
  comboOptions?: ScoreComboOptions,
): Map<number, SearchCardSkillRateProfile> {
  return new Map(cards.map((card) => [
    card.cardId,
    getCachedSearchCardSkillRateProfile(card, input, chart, server, comboOptions),
  ]));
}

export function pruneDominatedAreaItemConfigurations(
  configurations: BandoriAreaItemConfiguration[],
  cards: CalculatedBandoriCard[],
  input: BandoriTeamSearchInput,
  server: number,
): BandoriAreaItemConfiguration[] {
  const userAreaItemsById = toAreaItemStateMap(input.userAreaItems);
  const uniqueConfigurations = new Map<string, BandoriAreaItemConfiguration>();
  configurations.forEach((configuration) => {
    const key = getAreaItemConfigurationKey(configuration);
    if (!uniqueConfigurations.has(key)) {
      uniqueConfigurations.set(key, configuration);
    }
  });
  const entries = [...uniqueConfigurations.values()].map((configuration) => ({
    configuration,
    bonuses: Float64Array.from(cards.map((card) => getAreaItemBonusForCard(
      card,
      input.areaItemsById,
      userAreaItemsById,
      configuration.selectedAreaItemIds,
      server,
    ))),
  }));
  const dominated = new Set<number>();

  for (let rightIndex = 0; rightIndex < entries.length; rightIndex += 1) {
    if (dominated.has(rightIndex)) {
      continue;
    }
    for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
      if (leftIndex === rightIndex || dominated.has(leftIndex)) {
        continue;
      }
      let allGreaterOrEqual = true;
      let strictlyGreater = false;
      for (let cardIndex = 0; cardIndex < cards.length; cardIndex += 1) {
        const delta = entries[leftIndex].bonuses[cardIndex] - entries[rightIndex].bonuses[cardIndex];
        if (delta < -0.000001) {
          allGreaterOrEqual = false;
          break;
        }
        if (delta > 0.000001) {
          strictlyGreater = true;
        }
      }
      if (allGreaterOrEqual && strictlyGreater) {
        dominated.add(rightIndex);
        break;
      }
    }
  }

  return entries
    .filter((_, index) => !dominated.has(index))
    .map((entry) => entry.configuration);
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

    return power + calculateBandoriRoundedParamBonusPower(card.characterParam, [
      getRegionalNumber(areaItem.performance?.[String(level)], server) / 100,
      getRegionalNumber(areaItem.technique?.[String(level)], server) / 100,
      getRegionalNumber(areaItem.visual?.[String(level)], server) / 100,
    ]);
  }, 0);
}

function buildSearchPrecomputedData(
  cards: CalculatedBandoriCard[],
  input: BandoriTeamSearchInput,
  configurations: BandoriAreaItemConfiguration[],
  chart: PreparedChart,
  server: number,
  supportBandContext?: SupportBandContext,
): SearchPrecomputedData {
  const cardIndexById = new Map(cards.map((card, index) => [card.cardId, index]));
  const eventMode = resolveBandoriTeamSearchEventMode(input.eventType, input.liveType);
  const cardStaticProfilesById = new Map<number, SearchCardStaticProfile>();
  for (const card of cards) {
    const eventBonus = calculateBandoriCardEventBonus(card, input.eventBonus);
    const eventPower = eventMode === "parameterPower"
      ? input.useSpecialRoomBonus
        ? PARAMETER_KEYS.reduce((sum, _, index) => sum + eventBonus.parameterBonusWithRoom[index], 0)
        : PARAMETER_KEYS.reduce((sum, _, index) => sum + eventBonus.parameterBonus[index], 0)
      : 0;
    cardStaticProfilesById.set(card.cardId, {
      ...getCachedSearchCardSkillRateProfile(card, input, chart, server),
      skillSignature: buildSkillSearchSignature(card.skillId, input.skillsById[String(card.skillId)], card.skillLevel, server),
      pointBonusRate: eventBonus.pointBonusRate,
      supportPower: supportBandContext?.supportPowerByCardId.get(card.cardId) ?? 0,
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
    cardIndexById,
    cardStaticProfilesById,
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
    const staticProfile = precomputed?.cardStaticProfilesById.get(card.cardId);
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

function sortAreaItemConfigurationsForSearch(
  configurations: BandoriAreaItemConfiguration[],
  cards: CalculatedBandoriCard[],
  input: BandoriTeamSearchInput,
  server: number,
  eventMode: BandoriTeamSearchEventMode,
  precomputed?: SearchPrecomputedData,
): BandoriAreaItemConfiguration[] {
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

export function buildCalculatedCards(input: BandoriTeamSearchInput): CalculatedBandoriCard[] {
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

function shouldUseMissionSupportBand(input: BandoriTeamSearchInput): boolean {
  return normalizeSearchEventType(input.eventType) === "mission_live"
    && normalizeSearchTarget(input.target) === "eventPoint"
    && resolveBandoriTeamSearchEventMode(input.eventType, input.liveType) === "pointBonus";
}

function calculateSupportCardPower(card: CalculatedBandoriCard, input: BandoriTeamSearchInput): number {
  return calculateBandoriSupportCardEventBonus(card, input.eventBonus).supportPower;
}

function compareSupportBandCandidates(left: SupportBandCandidate, right: SupportBandCandidate): number {
  return (
    right.supportPower - left.supportPower
    || right.card.totalPower - left.card.totalPower
    || left.card.cardId - right.card.cardId
  );
}

function selectSupportBandCandidates(
  candidates: SupportBandCandidate[],
  excludedCardIds: readonly number[],
): SupportBandSelection {
  const supportCards: SupportBandCandidate[] = [];
  const excludedCardIdSet = new Set(excludedCardIds);
  const usedCharacterIds = new Set<number>();
  let supportBandPower = 0;

  for (const candidate of candidates) {
    if (excludedCardIdSet.has(candidate.card.cardId) || usedCharacterIds.has(candidate.card.characterId)) {
      continue;
    }

    supportCards.push(candidate);
    usedCharacterIds.add(candidate.card.characterId);
    supportBandPower += candidate.supportPower;
    if (supportCards.length === 5) {
      break;
    }
  }

  return {
    supportBandPower,
    supportCards,
  };
}

function createSupportBandContext(input: BandoriTeamSearchInput, cards: CalculatedBandoriCard[]): SupportBandContext {
  const enabled = shouldUseMissionSupportBand(input);
  if (!enabled) {
    return {
      enabled: false,
      candidates: [],
      supportPowerByCardId: new Map(),
      supportBandPowerUpperBound: 0,
      supportBandPointUpperBound: 0,
      evaluationCount: 0,
      skippedByUpperBoundCount: 0,
      selectionCache: new Map(),
    };
  }

  const candidates = cards
    .map((card) => ({
      card,
      supportPower: calculateSupportCardPower(card, input),
    }))
    .sort(compareSupportBandCandidates);
  const upperSelection = selectSupportBandCandidates(candidates, []);
  const supportPowerByCardId = new Map(candidates.map((candidate) => [
    candidate.card.cardId,
    candidate.supportPower,
  ]));

  return {
    enabled: true,
    candidates,
    supportPowerByCardId,
    supportBandPowerUpperBound: upperSelection.supportBandPower,
    supportBandPointUpperBound: Math.floor(upperSelection.supportBandPower / 3000),
    evaluationCount: 0,
    skippedByUpperBoundCount: 0,
    selectionCache: new Map(),
  };
}

function getSupportSelectionKey(cards: readonly SearchCard[]): string {
  return cards
    .map((card) => card.cardId)
    .sort((left, right) => left - right)
    .join(",");
}

function resolveSupportBandForTeam(cards: readonly SearchCard[], context?: SupportBandContext): SupportBandSelection | null {
  if (!context?.enabled) {
    return null;
  }

  const key = getSupportSelectionKey(cards);
  const cached = context.selectionCache.get(key);
  if (cached) {
    return cached;
  }

  context.evaluationCount += 1;
  const selection = selectSupportBandCandidates(
    context.candidates,
    cards.map((card) => card.cardId),
  );
  context.selectionCache.set(key, selection);
  return selection;
}

export function buildSearchCardsForConfiguration(
  cards: CalculatedBandoriCard[],
  input: BandoriTeamSearchInput,
  configuration: BandoriAreaItemConfiguration,
  server: number,
  skillRateProfiles: Map<number, SearchCardSkillRateProfile>,
  supportBandContext?: SupportBandContext,
  precomputed?: SearchPrecomputedData,
): SearchCard[] {
  const userAreaItemsById = toAreaItemStateMap(input.userAreaItems);
  const eventMode = resolveBandoriTeamSearchEventMode(input.eventType, input.liveType);
  const configurationKey = getAreaItemConfigurationKey(configuration);
  const areaItemPowers = precomputed?.areaItemPowerByConfigurationKey.get(configurationKey);
  return cards.map((card, index) => {
    const itemPower = areaItemPowers?.[index] ?? getAreaItemBonusForCard(
      card,
      input.areaItemsById,
      userAreaItemsById,
      configuration.selectedAreaItemIds,
      server,
    );
    const staticProfile = precomputed?.cardStaticProfilesById.get(card.cardId);
    const eventBonus = staticProfile ? null : calculateBandoriCardEventBonus(card, input.eventBonus);
    const eventPower = eventMode === "parameterPower"
      ? staticProfile?.eventPower ?? (
        input.useSpecialRoomBonus
          ? PARAMETER_KEYS.reduce((sum, _, bonusIndex) => sum + (eventBonus?.parameterBonusWithRoom[bonusIndex] ?? 0), 0)
          : PARAMETER_KEYS.reduce((sum, _, bonusIndex) => sum + (eventBonus?.parameterBonus[bonusIndex] ?? 0), 0)
      )
      : 0;
    const skillRateProfile = staticProfile ?? skillRateProfiles.get(card.cardId);
    if (!skillRateProfile) {
      throw new Error(`Missing search skill rate profile for card ${card.cardId}`);
    }
    return {
      ...card,
      effectivePower: card.totalPower + itemPower + eventPower,
      pointBonusRate: staticProfile?.pointBonusRate ?? eventBonus?.pointBonusRate ?? 0,
      supportPower: staticProfile?.supportPower ?? supportBandContext?.supportPowerByCardId.get(card.cardId) ?? 0,
      skillSearchSignature: staticProfile?.skillSignature
        ?? buildSkillSearchSignature(card.skillId, input.skillsById[String(card.skillId)], card.skillLevel, server),
      ...skillRateProfile,
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

function compareSearchCardsForCompression(left: SearchCard, right: SearchCard): number {
  return (
    right.effectivePower - left.effectivePower
    || right.pointBonusRate - left.pointBonusRate
    || left.supportPower - right.supportPower
    || right.totalPower - left.totalPower
    || left.cardId - right.cardId
  );
}

function getCardScorePotential(card: SearchCard, baseScoreRatePerPower: number): number {
  return card.effectivePower * (baseScoreRatePerPower + card.skillAverageRate + card.skillLeaderRate);
}

function getTeamScorePotential(cards: SearchCard[]): number {
  return cards.reduce((sum, card) => (
    sum + card.effectivePower * (1 + card.skillAverageRate + card.skillLeaderRate)
  ), 0);
}

function createSearchObjectiveAdapter(
  input: BandoriTeamSearchInput,
  target: BandoriTeamSearchTarget,
  eventMode: BandoriTeamSearchEventMode,
  supportBandContext: SupportBandContext,
): SearchObjectiveAdapter {
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

function compressSearchCards(
  cards: SearchCard[],
  objective: SearchObjectiveAdapter,
): { cards: SearchCard[]; prunedCount: number } {
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
      card.effectivePower === current.effectivePower && card.cardId > current.cardId
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

function groupSearchCardsByCharacter(cards: SearchCard[]): SearchCard[] {
  const groups = new Map<number, SearchCard[]>();
  for (const card of cards) {
    const group = groups.get(card.characterId);
    if (group) {
      group.push(card);
    } else {
      groups.set(card.characterId, [card]);
    }
  }
  return [...groups.values()].flat();
}

function buildSearchCardGroups(cards: SearchCard[], upperBoundIndex: CharacterUpperBoundIndex): SearchCardGroup[] {
  const groups: SearchCardGroup[] = [];
  let currentGroup: SearchCardGroup | null = null;
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index];
    if (!currentGroup || currentGroup.characterId !== card.characterId) {
      const characterIndex = upperBoundIndex.characterIndexById.get(card.characterId);
      if (characterIndex === undefined) {
        continue;
      }
      currentGroup = {
        characterId: card.characterId,
        characterIndex,
        startIndex: index,
        cards: [],
      };
      groups.push(currentGroup);
    }
    currentGroup.cards.push(card);
  }
  return groups;
}

function getSearchCardTraversalValue(
  card: SearchCard,
  baseScoreRatePerPower: number,
  target: BandoriTeamSearchTarget,
  eventMode: BandoriTeamSearchEventMode,
  objective?: SearchObjectiveAdapter,
): number {
  if (objective) {
    return objective.getTraversalValue(card, baseScoreRatePerPower);
  }
  const scorePotential = card.effectivePower * (baseScoreRatePerPower + card.skillAverageRate + card.skillLeaderRate);
  if (target === "eventPoint" && eventMode === "pointBonus") {
    return scorePotential * (1 + Math.max(0, card.pointBonusRate)) + Math.max(0, card.pointBonusRate) * 1_000_000;
  }
  return scorePotential;
}

export function sortSearchCardsForTraversal(
  cards: SearchCard[],
  baseScoreRatePerPower: number,
  target: BandoriTeamSearchTarget = "score",
  eventMode: BandoriTeamSearchEventMode = "none",
  objective?: SearchObjectiveAdapter,
): SearchCard[] {
  return [...cards].sort((left, right) => {
    return (
      getSearchCardTraversalValue(right, baseScoreRatePerPower, target, eventMode, objective)
      - getSearchCardTraversalValue(left, baseScoreRatePerPower, target, eventMode, objective)
      || right.pointBonusRate - left.pointBonusRate
      || left.supportPower - right.supportPower
      || right.effectivePower - left.effectivePower
      || right.totalPower - left.totalPower
      || left.cardId - right.cardId
    );
  });
}

export function buildCharacterUpperBoundIndex(
  cards: SearchCard[],
  skillContextUpperMode?: SkillContextUpperMode,
): CharacterUpperBoundIndex {
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
    if (characterIndex !== undefined) {
      power[characterIndex] = Math.max(power[characterIndex], card.effectivePower);
      pointBonusRate[characterIndex] = Math.max(pointBonusRate[characterIndex], card.pointBonusRate);
      if (shouldBuildDefaultSkillMode) {
        skillAverageRate[characterIndex] = Math.max(skillAverageRate[characterIndex], card.skillAverageRate);
        skillLeaderRate[characterIndex] = Math.max(skillLeaderRate[characterIndex], card.skillLeaderRate);
      }
      if (shouldBuildSameBandSkillMode) {
        skillSameBandAverageRate[characterIndex] = Math.max(skillSameBandAverageRate[characterIndex], card.skillSameBandAverageRate);
        skillSameBandLeaderRate[characterIndex] = Math.max(skillSameBandLeaderRate[characterIndex], card.skillSameBandLeaderRate);
      }
      if (shouldBuildSameAttributeSkillMode) {
        skillSameAttributeAverageRate[characterIndex] = Math.max(skillSameAttributeAverageRate[characterIndex], card.skillSameAttributeAverageRate);
        skillSameAttributeLeaderRate[characterIndex] = Math.max(skillSameAttributeLeaderRate[characterIndex], card.skillSameAttributeLeaderRate);
      }
      if (shouldBuildBothSkillMode) {
        skillBothAverageRate[characterIndex] = Math.max(skillBothAverageRate[characterIndex], card.skillBothAverageRate);
        skillBothLeaderRate[characterIndex] = Math.max(skillBothLeaderRate[characterIndex], card.skillBothLeaderRate);
      }
      if (shouldBuildMixedSkillMode) {
        skillMixedAverageRate[characterIndex] = Math.max(skillMixedAverageRate[characterIndex], card.skillMixedAverageRate);
        skillMixedLeaderRate[characterIndex] = Math.max(skillMixedLeaderRate[characterIndex], card.skillMixedLeaderRate);
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
  };
}

export function insertTopValue(values: number[], value: number): void {
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

function sumTopFiveValues(
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

function getCardSkillAverageRateForUpperMode(card: SearchCard, mode: SkillContextUpperMode): number {
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

function getCardSkillLeaderRateForUpperMode(card: SearchCard, mode: SkillContextUpperMode): number {
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

function estimateTargetUpperBoundFromScore(
  scoreUpperBound: number,
  pointBonusRateUpper: number,
  input: BandoriTeamSearchInput,
  target: BandoriTeamSearchTarget,
  eventMode: BandoriTeamSearchEventMode,
  supportBandPointUpperBound = 0,
  scoreRateUpper?: number,
): number {
  if (!Number.isFinite(scoreUpperBound)) {
    return scoreUpperBound;
  }
  if (target === "eventPoint" && isChallengeLiveEventPointInput(input)) {
    return calculateChallengeLiveEventPointBase(Math.ceil(scoreUpperBound), input);
  }
  if (target !== "eventPoint" || eventMode !== "pointBonus") {
    return scoreUpperBound;
  }

  const eventPointBaseUpper = calculateEventPointBase(
    Math.ceil(scoreUpperBound),
    estimateTotalRoomScoreUpperBound(Math.ceil(scoreUpperBound), input, scoreRateUpper),
    input,
  );
  return eventPointBaseUpper === null
    ? scoreUpperBound
    : (
      Math.floor(eventPointBaseUpper * (1 + Math.max(0, pointBonusRateUpper))) + supportBandPointUpperBound
    );
}

function isUpperBoundBelowThreshold(upperBound: number, threshold: number): boolean {
  if (upperBound === Number.NEGATIVE_INFINITY) {
    return true;
  }
  return Number.isFinite(upperBound) && upperBound < threshold;
}

function isSearchUpperBoundBelowResultThreshold(
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

function compareUpperBoundDesc(left: number, right: number): number {
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
  const scoreBounds = [
    estimateBranchScoreUpperBoundForMode(
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
    ),
  ];
  const possibleSameBandIds = getPossibleSameBandIds(selectedCards, upperBoundIndex);
  const canKeepSameAttribute = canKeepSameAttributeContext(selectedCards);

  for (const bandId of possibleSameBandIds) {
    scoreBounds.push(estimateBranchScoreUpperBoundForMode(
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
    ));
  }

  if (canKeepSameAttribute) {
    scoreBounds.push(estimateBranchScoreUpperBoundForMode(
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
    ));

    for (const bandId of possibleSameBandIds) {
      scoreBounds.push(estimateBranchScoreUpperBoundForMode(
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
      ));
    }
  }

  return scoreBounds.reduce((maxScore, score) => Math.max(maxScore, score), Number.NEGATIVE_INFINITY);
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

function estimateSearchScopeTargetUpperBoundFromScore(
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

type CorrelatedUpperState = {
  power: number;
  skillAverageRate: number;
  skillLeaderRate: number;
  pointBonusRate: number;
};

function dominatesCorrelatedUpperState(left: CorrelatedUpperState, right: CorrelatedUpperState): boolean {
  return left.power >= right.power
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

function shouldUseCorrelatedUpperBound(
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

function estimateCorrelatedSearchScopeTargetUpperBound(
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
): number | null {
  if (!skillContextUpperMode) {
    return null;
  }

  const remaining = 5 - selectedCards.length;
  const selectedState: CorrelatedUpperState = {
    power: selectedPower,
    skillAverageRate: selectedSkillAverageRate ?? sumSelectedSkillAverageRateForUpperMode(selectedCards, skillContextUpperMode),
    skillLeaderRate: selectedSkillLeaderRate ?? maxSelectedSkillLeaderRateForUpperMode(selectedCards, skillContextUpperMode),
    pointBonusRate: selectedPointBonusRate,
  };
  if (remaining === 0) {
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
    const characterState: CorrelatedUpperState = {
      power,
      skillAverageRate: skillAverageRateByCharacter[characterIndex] ?? 0,
      skillLeaderRate: skillLeaderRateByCharacter[characterIndex] ?? 0,
      pointBonusRate: Math.max(0, pointBonusRateByCharacter[characterIndex] ?? 0),
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

function pruneCardsByInclusionTargetUpperBound(
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

function getPossibleSameBandIds(
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

function canKeepSameAttributeContext(cards: SearchCard[]): boolean {
  if (cards.length < 2) {
    return true;
  }

  const attributes = new Set<BandoriCardAttribute>();
  for (const card of cards) {
    attributes.add(card.attribute);
  }
  return attributes.size === 1;
}

function getSearchTeamContext(cards: SearchCard[]): {
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

function scopeOwnsCompleteTeam(cards: SearchCard[], mode?: SkillContextUpperMode): boolean {
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

function hasAtLeastDistinctCharacters(cards: SearchCard[], count: number): boolean {
  const characterIds = new Set<number>();
  for (const card of cards) {
    characterIds.add(card.characterId);
    if (characterIds.size >= count) {
      return true;
    }
  }
  return false;
}

function addSearchCardToGroup<K>(groups: Map<K, SearchCard[]>, key: K, card: SearchCard): void {
  const group = groups.get(key);
  if (group) {
    group.push(card);
  } else {
    groups.set(key, [card]);
  }
}

function createSearchScopes(cards: SearchCard[], useContextPartitioning: boolean): SearchScope[] {
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

function buildSeedTeams(
  cards: SearchCard[],
  target: BandoriTeamSearchTarget,
  eventMode: BandoriTeamSearchEventMode,
  objective?: SearchObjectiveAdapter,
): SearchCard[][] {
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

function getResultCardIdsKey(result: BandoriTeamSearchResult): string {
  return result.cards.map((card) => card.cardId).join(",");
}

function compareResults(left: BandoriTeamSearchResult, right: BandoriTeamSearchResult): number {
  const targetComparison = right.targetValue - left.targetValue;
  if (targetComparison !== 0) {
    return targetComparison;
  }

  if (left.target === "eventPoint" && right.target === "eventPoint") {
    return right.totalPower - left.totalPower
      || right.score - left.score
      || right.skills[0].skillId - left.skills[0].skillId
      || getResultCardIdsKey(left).localeCompare(getResultCardIdsKey(right));
  }

  return right.score - left.score
    || right.totalPower - left.totalPower
    || right.skills[0].skillId - left.skills[0].skillId
    || getResultCardIdsKey(left).localeCompare(getResultCardIdsKey(right));
}

function sortResults(results: BandoriTeamSearchResult[]): void {
  results.sort(compareResults);
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

function toSupportResultCards(cards: SupportBandCandidate[]): BandoriTeamSearchSupportCard[] {
  return cards.map((candidate) => ({
    cardId: candidate.card.cardId,
    characterId: candidate.card.characterId,
    bandId: candidate.card.bandId,
    attribute: candidate.card.attribute,
    rarity: candidate.card.rarity,
    skillId: candidate.card.skillId,
    skillLevel: candidate.card.skillLevel,
    level: candidate.card.level,
    masterRank: candidate.card.masterRank,
    totalPower: candidate.card.totalPower,
    supportPower: candidate.supportPower,
  }));
}

function getBaseCardPower(card: CalculatedBandoriCard): number {
  return card.baseParam[0] + card.baseParam[1] + card.baseParam[2];
}

function getTeamEvaluationKey(cards: SearchCard[], configuration: BandoriAreaItemConfiguration): string {
  const cardKey = cards.map((card) => card.cardId).sort((left, right) => left - right).join(",");
  return `${getAreaItemConfigurationKey(configuration)}|${cardKey}`;
}

function getTeamCardSetKey(cards: Array<{ cardId: number }>): string {
  return cards.map((card) => card.cardId).sort((left, right) => left - right).join(",");
}

function normalizeSearchTarget(value: BandoriTeamSearchTarget | undefined): BandoriTeamSearchTarget {
  return value === "eventPoint" ? value : "score";
}

function normalizeSearchLiveType(value: BandoriTeamSearchLiveType | undefined): BandoriTeamSearchLiveType {
  if (value === "multi" || value === "challenge" || value === "versus") {
    return value;
  }
  return "free";
}

function normalizeSearchEventType(value: BandoriTeamSearchEventType | undefined): BandoriTeamSearchEventType {
  if (
    value === "story"
    || value === "challenge"
    || value === "versus"
    || value === "live_try"
    || value === "mission_live"
    || value === "festival"
    || value === "medley"
  ) {
    return value;
  }
  return "none";
}

export function resolveBandoriTeamSearchEventMode(
  eventTypeValue: BandoriTeamSearchEventType | undefined,
  liveTypeValue: BandoriTeamSearchLiveType | undefined,
): BandoriTeamSearchEventMode {
  const eventType = normalizeSearchEventType(eventTypeValue);
  const liveType = normalizeSearchLiveType(liveTypeValue);

  if (eventType === "none") {
    return "none";
  }
  if (eventType === "challenge") {
    return liveType === "challenge" ? "parameterPower" : "pointBonus";
  }
  if (eventType === "versus" || eventType === "festival" || eventType === "medley") {
    return "parameterPower";
  }
  return "pointBonus";
}

export function resolveBandoriTeamSearchUseFever(input: Pick<BandoriTeamSearchInput, "eventType" | "liveType" | "useFever">): boolean {
  if (input.eventType === undefined && input.liveType === undefined) {
    return input.useFever === true;
  }

  const eventType = normalizeSearchEventType(input.eventType);
  const liveType = normalizeSearchLiveType(input.liveType);
  return eventType === "festival" || (liveType === "multi" && eventType !== "versus");
}

function getSearchCardsTeamContext(cards: SearchCard[]): BandoriTeamContext {
  let sameBandId: number | null | undefined;
  let sameAttribute: BandoriCardAttribute | null | undefined;

  for (const card of cards) {
    if (card.bandId === null) {
      sameBandId = null;
      break;
    }
    if (sameBandId === undefined) {
      sameBandId = card.bandId;
    } else if (sameBandId !== card.bandId) {
      sameBandId = null;
      break;
    }
  }

  for (const card of cards) {
    if (sameAttribute === undefined) {
      sameAttribute = card.attribute;
    } else if (sameAttribute !== card.attribute) {
      sameAttribute = null;
      break;
    }
  }

  return {
    sameBandId: sameBandId ?? null,
    sameAttribute: sameAttribute ?? null,
  };
}

function getTeamContextCacheKey(context: BandoriTeamContext): string {
  return `${context.sameBandId ?? "mixed"}:${context.sameAttribute ?? "mixed"}`;
}

function resolveCachedBandoriSkill(
  skillId: number,
  skill: BestdoriSkillMaster | undefined,
  skillLevel: number,
  context: BandoriTeamContext,
  server: number,
  cache?: ScoreCalculationCache,
): ResolvedBandoriSkill | null {
  if (!skill) {
    return null;
  }
  const key = [
    server,
    skillId,
    skillLevel,
    getTeamContextCacheKey(context),
  ].join(":");
  if (cache?.resolvedSkills?.has(key)) {
    return cache.resolvedSkills.get(key) ?? null;
  }

  const resolved = resolveBandoriSkill(skillId, skill, skillLevel, context, server);
  cache?.resolvedSkills?.set(key, resolved);
  return resolved;
}

function resolveEncoreSkill(
  input: BandoriTeamSearchInput,
  context: BandoriTeamContext,
  server: number,
  cache?: ScoreCalculationCache,
): ResolvedBandoriSkill | undefined {
  if (normalizeSearchLiveType(input.liveType) !== "multi" || !input.encoreSkillSource || input.encoreSkillSource === "self") {
    return undefined;
  }

  const externalIndex = Number(input.encoreSkillSource.replace("other", "")) - 1;
  const externalSkill = input.otherPlayerSkills?.[externalIndex];
  if (!externalSkill) {
    return undefined;
  }

  const skill = input.skillsById[String(externalSkill.skillId)];
  return resolveCachedBandoriSkill(externalSkill.skillId, skill, externalSkill.skillLevel, context, server, cache) ?? undefined;
}

function resolveOtherPlayerSkills(
  input: BandoriTeamSearchInput,
  context: BandoriTeamContext,
  server: number,
  cache?: ScoreCalculationCache,
): Array<ResolvedBandoriSkill | null> {
  if (normalizeSearchLiveType(input.liveType) !== "multi") {
    return [];
  }

  return (input.otherPlayerSkills ?? []).slice(0, 4).map((externalSkill) => {
    const skill = input.skillsById[String(externalSkill.skillId)];
    return resolveCachedBandoriSkill(externalSkill.skillId, skill, externalSkill.skillLevel, context, server, cache);
  });
}

function calculateRoomScore(
  score: number,
  totalPower: number,
  input: BandoriTeamSearchInput,
  roomScoreRatePerPower?: number,
): number | null {
  if (normalizeSearchLiveType(input.liveType) !== "multi") {
    return null;
  }

  const otherPlayersPower = getOtherPlayersPower(input);
  if (otherPlayersPower <= 0 || totalPower <= 0) {
    return Math.floor(score + SCORE_FLOOR_EPSILON);
  }

  if (roomScoreRatePerPower !== undefined && Number.isFinite(roomScoreRatePerPower)) {
    return Math.floor(score + roomScoreRatePerPower * otherPlayersPower + SCORE_FLOOR_EPSILON);
  }

  return Math.floor(score + (score / totalPower) * otherPlayersPower + SCORE_FLOOR_EPSILON);
}

function calculateWithSoftCap(value: number, divisor: number, caps: readonly number[]): number {
  let remaining = Math.max(0, value);
  let scaled = 0;
  for (let index = 0; index < caps.length; index += 1) {
    const cap = caps[index];
    if (remaining <= cap) {
      scaled += Math.floor((remaining / divisor / (index + 1)) * 100);
      break;
    }
    remaining -= cap;
    scaled += Math.floor((cap / divisor / (index + 1)) * 100);
  }
  return Math.floor(scaled / 100);
}

function getOtherPlayersPower(input: BandoriTeamSearchInput): number {
  if (normalizeSearchLiveType(input.liveType) !== "multi") {
    return 0;
  }
  const otherPlayersAveragePower = Math.max(0, Math.trunc(toFiniteNumber(input.otherPlayersAveragePower, 0)));
  if (otherPlayersAveragePower > 0) {
    return otherPlayersAveragePower * 4;
  }
  const roomPowerAlias = Math.max(0, Math.trunc(toFiniteNumber(input.roomPower, 0)));
  return roomPowerAlias > 0 ? roomPowerAlias * 4 : 0;
}

function estimateTotalRoomScoreUpperBound(
  scoreUpperBound: number,
  input: BandoriTeamSearchInput,
  scoreRateUpper?: number,
): number | null {
  if (normalizeSearchLiveType(input.liveType) !== "multi") {
    return null;
  }
  if (!Number.isFinite(scoreUpperBound) || !Number.isFinite(scoreRateUpper ?? Number.NaN)) {
    return Number.POSITIVE_INFINITY;
  }

  const otherPlayersPower = getOtherPlayersPower(input);
  return Math.ceil(scoreUpperBound + Math.max(0, scoreRateUpper ?? 0) * otherPlayersPower);
}

const LIVE_BOOST_COUNTS = [0, 1, 2, 3] as const;
const CHALLENGE_CP_COSTS = [200, 400, 800, 1600] as const;
const EVENT_PLACEMENTS = [1, 2, 3, 4, 5] as const;

function normalizeLiveBoostCount(liveBoostCount: number | undefined): 0 | 1 | 2 | 3 {
  const normalized = clamp(Math.trunc(toFiniteNumber(liveBoostCount, 3)), 0, 3);
  return normalized as 0 | 1 | 2 | 3;
}

function getLiveBoostMultiplier(liveBoostCount: number | undefined): number {
  return [1, 5, 10, 15][normalizeLiveBoostCount(liveBoostCount)] ?? 15;
}

function normalizeChallengeCpCost(challengeCpCost: number | undefined): 200 | 400 | 800 | 1600 {
  switch (Math.trunc(toFiniteNumber(challengeCpCost, 1600))) {
    case 200:
      return 200;
    case 400:
      return 400;
    case 800:
      return 800;
    case 1600:
    default:
      return 1600;
  }
}

function getChallengeCpMultiplier(challengeCpCost: number | undefined): number {
  return {
    200: 1,
    400: 2,
    800: 4,
    1600: 8,
  }[normalizeChallengeCpCost(challengeCpCost)];
}

function getEventPointMultiplier(input: BandoriTeamSearchInput): number {
  return isChallengeLiveEventPointInput(input)
    ? getChallengeCpMultiplier(input.challengeCpCost)
    : getLiveBoostMultiplier(input.liveBoostCount);
}

function isChallengeLiveEventPointInput(input: Pick<BandoriTeamSearchInput, "eventType" | "liveType">): boolean {
  return normalizeSearchEventType(input.eventType) === "challenge"
    && normalizeSearchLiveType(input.liveType) === "challenge";
}

function calculateChallengeLiveEventPointBase(score: number, input: BandoriTeamSearchInput): number {
  const formula = input.eventFormula ?? 0;
  return formula === 2
    ? 3250 + Math.floor(score / 450)
    : 1000 + calculateWithSoftCap(score, 300, [2_100_000, 150_000, 250_000, Number.POSITIVE_INFINITY]);
}

function calculateChallengeLiveEventPoint(score: number, input: BandoriTeamSearchInput): number {
  return calculateChallengeLiveEventPointBase(score, input) * getChallengeCpMultiplier(input.challengeCpCost);
}

function calculateVersusLiveEventPointBase(
  score: number,
  eventFormula: number,
  placement: 1 | 2 | 3 | 4 | 5,
): number {
  const placementIndex = placement - 1;
  return eventFormula === 2
    ? Math.floor(score / 6500) + ([200, 173, 146, 123, 100][placementIndex] ?? 100)
    : calculateWithSoftCap(score, 5500, [2_100_000, 150_000, 250_000, Number.POSITIVE_INFINITY])
      + ([60, 52, 44, 37, 30][placementIndex] ?? 30);
}

function calculateFestivalEventPointBase(
  score: number,
  eventFormula: number,
  festivalResult: "win" | "lose",
  placement: 1 | 2 | 3 | 4 | 5,
): number {
  const placementIndex = placement - 1;
  if (eventFormula === 2) {
    return Math.floor(score / 6500)
      + 50
      + (festivalResult === "win" ? 125 : 0)
      + ([125, 117, 110, 105, 100][placementIndex] ?? 100);
  }
  return calculateWithSoftCap(score, 5500, [2_625_000, 187_500, 312_500, Number.POSITIVE_INFINITY])
    + 20
    + (festivalResult === "win" ? 50 : 0)
    + ([50, 47, 44, 42, 40][placementIndex] ?? 40);
}

function getEventPointBaseConfig(input: BandoriTeamSearchInput): { base: number; divisor: number } | null {
  const eventType = normalizeSearchEventType(input.eventType);
  const formula = input.eventFormula ?? 0;
  switch (eventType) {
    case "story":
      return { base: 50, divisor: 10_000 };
    case "challenge":
      return formula === 2 ? { base: 70, divisor: 50_000 } : { base: 20, divisor: 25_000 };
    case "live_try":
      return formula === 2 ? { base: 130, divisor: 26_000 } : { base: 40, divisor: 13_000 };
    case "mission_live":
      return formula === 2 ? { base: 120, divisor: 15_000 } : { base: 40, divisor: 10_000 };
    default:
      return null;
  }
}

function calculateEventPointBase(score: number, roomScore: number | null, input: BandoriTeamSearchInput): number | null {
  const eventType = normalizeSearchEventType(input.eventType);
  if (eventType === "none") {
    return null;
  }

  const config = getEventPointBaseConfig(input);
  const totalRoomScore = roomScore ?? score;
  const cappedOwnScore = Math.min(1_500_000, score);
  const cappedRoomScore = Math.min(7_500_000, totalRoomScore);
  const otherScore = Math.max(0, cappedRoomScore - cappedOwnScore);
  const formula = input.eventFormula ?? 0;
  if (eventType === "versus") {
    return null;
  }
  if (!config) {
    return null;
  }
  if (formula === 1) {
    return config.base
      + calculateWithSoftCap(score, config.divisor, [1_600_000, 150_000, 250_000, 400_000, Number.POSITIVE_INFINITY])
      + calculateWithSoftCap(Math.max(0, totalRoomScore - score), config.divisor * 10, [6_400_000, 600_000, 1_000_000, 1_600_000, Number.POSITIVE_INFINITY]);
  }
  if (formula === 2) {
    return config.base + Math.floor(score / config.divisor) + Math.floor(Math.max(0, totalRoomScore - score) / config.divisor / 10);
  }
  return config.base + Math.floor(cappedOwnScore / config.divisor) + Math.floor(otherScore / config.divisor / 10);
}

function calculateEventPointBeforeMultiplier(
  score: number,
  roomScore: number | null,
  pointBonusRate: number,
  input: BandoriTeamSearchInput,
  supportBandPower = 0,
): number | null {
  const base = calculateEventPointBase(score, roomScore, input);
  if (base === null) {
    return null;
  }
  return Math.floor(base * (1 + pointBonusRate)) + Math.floor(Math.max(0, supportBandPower) / 3000);
}

function calculateEventPoint(
  score: number,
  roomScore: number | null,
  pointBonusRate: number,
  input: BandoriTeamSearchInput,
  supportBandPower = 0,
): number | null {
  const beforeMultiplier = calculateEventPointBeforeMultiplier(score, roomScore, pointBonusRate, input, supportBandPower);
  if (beforeMultiplier === null) {
    return null;
  }
  return Math.floor(beforeMultiplier * getEventPointMultiplier(input));
}

function createEventPointOptions(
  score: number,
  eventPointBase: number | null,
  input: BandoriTeamSearchInput,
): BandoriTeamSearchEventPointOptions {
  // Live Boost、CP、排名、胜负只改变展示 PT，不参与队伍排序，避免 UI 切换触发重新搜索。
  const eventType = normalizeSearchEventType(input.eventType);
  const eventFormula = input.eventFormula ?? 0;
  if (isChallengeLiveEventPointInput(input)) {
    const base = calculateChallengeLiveEventPointBase(score, input);
    const defaultCpCost = normalizeChallengeCpCost(input.challengeCpCost);
    return {
      mode: "challengeCp",
      defaultKey: `cp-${defaultCpCost}`,
      options: CHALLENGE_CP_COSTS.map((challengeCpCost) => {
        const multiplier = getChallengeCpMultiplier(challengeCpCost);
        return {
          key: `cp-${challengeCpCost}`,
          challengeCpCost,
          eventPointBase: base,
          multiplier,
          eventPoint: base * multiplier,
        };
      }),
    };
  }

  if (eventType === "versus") {
    const defaultLiveBoostCount = normalizeLiveBoostCount(input.liveBoostCount);
    return {
      mode: "versus",
      defaultKey: `liveBoost-${defaultLiveBoostCount}-rank-1`,
      options: LIVE_BOOST_COUNTS.flatMap((liveBoostCount) => EVENT_PLACEMENTS.map((placement) => {
        const base = calculateVersusLiveEventPointBase(score, eventFormula, placement);
        const multiplier = getLiveBoostMultiplier(liveBoostCount);
        return {
          key: `liveBoost-${liveBoostCount}-rank-${placement}`,
          liveBoostCount,
          placement,
          eventPointBase: base,
          multiplier,
          eventPoint: base * multiplier,
        };
      })),
    };
  }

  if (eventType === "festival") {
    const defaultLiveBoostCount = normalizeLiveBoostCount(input.liveBoostCount);
    return {
      mode: "festival",
      defaultKey: `liveBoost-${defaultLiveBoostCount}-win-rank-1`,
      options: LIVE_BOOST_COUNTS.flatMap((liveBoostCount) => (
        (["win", "lose"] as const).flatMap((festivalResult) => EVENT_PLACEMENTS.map((placement) => {
          const base = calculateFestivalEventPointBase(score, eventFormula, festivalResult, placement);
          const multiplier = getLiveBoostMultiplier(liveBoostCount);
          return {
            key: `liveBoost-${liveBoostCount}-${festivalResult}-rank-${placement}`,
            liveBoostCount,
            festivalResult,
            placement,
            eventPointBase: base,
            multiplier,
            eventPoint: base * multiplier,
          };
        }))
      )),
    };
  }

  if (eventPointBase !== null) {
    const defaultLiveBoostCount = normalizeLiveBoostCount(input.liveBoostCount);
    return {
      mode: "liveBoost",
      defaultKey: `liveBoost-${defaultLiveBoostCount}`,
      options: LIVE_BOOST_COUNTS.map((liveBoostCount) => {
        const multiplier = getLiveBoostMultiplier(liveBoostCount);
        return {
          key: `liveBoost-${liveBoostCount}`,
          liveBoostCount,
          eventPointBase,
          multiplier,
          eventPoint: Math.floor(eventPointBase * multiplier),
        };
      }),
    };
  }

  return {
    mode: "none",
    defaultKey: null,
    options: [],
  };
}

function getTargetValue(result: {
  totalPower: number;
  averageScore: number;
  eventPoint: number | null;
  eventMode: BandoriTeamSearchEventMode;
}, target: BandoriTeamSearchTarget): number {
  switch (target) {
    case "eventPoint":
      return result.eventPoint ?? (
        result.eventMode === "pointBonus" ? Number.NEGATIVE_INFINITY : result.averageScore
      );
    case "score":
    default:
      return result.averageScore;
  }
}

export function evaluateTeam(
  cards: SearchCard[],
  input: BandoriTeamSearchInput,
  chart: PreparedChart,
  configuration: BandoriAreaItemConfiguration,
  server: number,
  perfectRate: number,
  scoreCache?: ScoreCalculationCache,
  comboOptions?: ScoreComboOptions,
  supportBandContext?: SupportBandContext,
  pruningThresholdResult?: BandoriTeamSearchResult,
): BandoriTeamSearchResult | null {
  const context = getSearchCardsTeamContext(cards);
  const resolvedSkills = cards.map((card) => {
    const skill = input.skillsById[String(card.skillId)];
    return resolveCachedBandoriSkill(card.skillId, skill, card.skillLevel, context, server, scoreCache);
  });
  const eventMode = resolveBandoriTeamSearchEventMode(input.eventType, input.liveType);
  const eventBonuses = cards.map((card) => calculateBandoriCardEventBonus(card, input.eventBonus));
  const pointBonusRate = eventMode === "pointBonus"
    ? Math.round(eventBonuses.reduce((sum, bonus) => sum + bonus.pointBonusRate, 0) * 100) / 100
    : 0;
  const totalPower = Math.floor(cards.reduce((sum, card) => sum + card.effectivePower, 0));
  const target = normalizeSearchTarget(input.target);
  const liveType = normalizeSearchLiveType(input.liveType);
  const eventType = normalizeSearchEventType(input.eventType);
  const otherPlayerSkills = resolveOtherPlayerSkills(input, context, server, scoreCache);
  const shouldCalculateDetailedScore = pruningThresholdResult
    ? (targetOnlyResult: SkillWindowScoreResult): boolean => {
      const preliminaryRoomScore = calculateRoomScore(
        targetOnlyResult.rawAverageScore ?? targetOnlyResult.averageScore,
        totalPower,
        input,
        targetOnlyResult.roomScoreRatePerPower,
      );
      const preliminarySupportPower = supportBandContext?.enabled && eventMode === "pointBonus"
        ? supportBandContext.supportBandPowerUpperBound
        : 0;
      const preliminaryEventPoint = eventMode === "pointBonus"
        ? calculateEventPointBeforeMultiplier(
          targetOnlyResult.rawAverageScore ?? targetOnlyResult.averageScore,
          preliminaryRoomScore,
          pointBonusRate,
          input,
          preliminarySupportPower,
        )
        : isChallengeLiveEventPointInput(input)
          ? calculateChallengeLiveEventPointBase(targetOnlyResult.averageScore, input)
          : null;
      const preliminaryTargetValue = getTargetValue({
        totalPower,
        averageScore: targetOnlyResult.averageScore,
        eventPoint: preliminaryEventPoint,
        eventMode,
      }, target);
      return !isSearchUpperBoundBelowResultThreshold(
        preliminaryTargetValue,
        targetOnlyResult.averageScore,
        pruningThresholdResult,
      );
    }
    : undefined;
  const calculateBest = (targetOnly: boolean): SkillWindowScoreResult => otherPlayerSkills.length > 0
    ? calculateBestMultiLiveScoreForSkillWindows(
      chart,
      totalPower,
      resolvedSkills,
      otherPlayerSkills,
      input.encoreSkillSource,
      cards,
      perfectRate,
      scoreCache,
      comboOptions,
      targetOnly,
      shouldCalculateDetailedScore,
    )
    : calculateBestScoreForNonOverlappingSkillWindows(
      chart,
      totalPower,
      resolvedSkills,
      perfectRate,
      scoreCache,
      resolveEncoreSkill(input, context, server, scoreCache),
      comboOptions,
      targetOnly,
      shouldCalculateDetailedScore,
    );
  const best = calculateBest(false);

  if (!Number.isFinite(best.score)) {
    return null;
  }

  const scoreForRoomAndPoint = best.rawAverageScore ?? best.averageScore;
  const roomScore = calculateRoomScore(scoreForRoomAndPoint, totalPower, input, best.roomScoreRatePerPower);

  if (pruningThresholdResult) {
    const preliminarySupportPower = supportBandContext?.enabled && eventMode === "pointBonus"
      ? supportBandContext.supportBandPowerUpperBound
      : 0;
    const preliminaryEventPoint = eventMode === "pointBonus"
      ? calculateEventPointBeforeMultiplier(scoreForRoomAndPoint, roomScore, pointBonusRate, input, preliminarySupportPower)
      : isChallengeLiveEventPointInput(input)
        ? calculateChallengeLiveEventPointBase(best.averageScore, input)
        : null;
    const preliminaryTargetValue = getTargetValue({
      totalPower,
      averageScore: best.averageScore,
      eventPoint: preliminaryEventPoint,
      eventMode,
    }, normalizeSearchTarget(input.target));
    if (isSearchUpperBoundBelowResultThreshold(
      preliminaryTargetValue,
      best.averageScore,
      pruningThresholdResult,
    )) {
      if (supportBandContext?.enabled && eventMode === "pointBonus") {
        supportBandContext.skippedByUpperBoundCount += 1;
      }
      return null;
    }
  }

  const supportBand = resolveSupportBandForTeam(cards, supportBandContext);
  const supportBandPower = supportBand?.supportBandPower ?? 0;
  const eventPointBase = eventMode === "pointBonus"
    ? calculateEventPointBeforeMultiplier(scoreForRoomAndPoint, roomScore, pointBonusRate, input, supportBandPower)
    : isChallengeLiveEventPointInput(input)
      ? calculateChallengeLiveEventPointBase(scoreForRoomAndPoint, input)
      : null;
  const eventPointOptions = createEventPointOptions(scoreForRoomAndPoint, eventPointBase, input);
  const defaultEventPointOption = (
    eventPointOptions.options.find((option) => option.key === eventPointOptions.defaultKey)
    ?? eventPointOptions.options[0]
    ?? null
  );
  const eventPointMultiplier = defaultEventPointOption?.multiplier ?? (eventPointBase === null ? 1 : getEventPointMultiplier(input));
  const eventPoint = defaultEventPointOption?.eventPoint ?? (
    eventMode === "pointBonus"
      ? calculateEventPoint(scoreForRoomAndPoint, roomScore, pointBonusRate, input, supportBandPower)
      : isChallengeLiveEventPointInput(input)
        ? calculateChallengeLiveEventPoint(scoreForRoomAndPoint, input)
        : null
  );
  const targetEventPoint = eventType === "versus" || eventType === "festival" ? null : eventPointBase;
  const targetValue = getTargetValue({ totalPower, averageScore: best.averageScore, eventPoint: targetEventPoint, eventMode }, target);
  if (
    pruningThresholdResult
    && isSearchUpperBoundBelowResultThreshold(targetValue, best.averageScore, pruningThresholdResult)
  ) {
    return null;
  }

  const skillOrderCardIds = best.skillOrderCardIds ?? [
    ...best.permutation.map((cardIndex) => cards[cardIndex].cardId),
    cards[best.leaderIndex].cardId,
  ];
  const skillOrderActors = best.skillOrderActors;
  const baseCardPower = cards.reduce((sum, card) => sum + getBaseCardPower(card), 0);
  const userAreaItemsById = toAreaItemStateMap(input.userAreaItems);
  const areaItemResult = calculateBandoriSelectedAreaItemPower(
    cards,
    input.areaItemsById,
    userAreaItemsById,
    configuration.selectedAreaItemIds,
    server,
  );
  const eventPower = Math.floor(eventBonuses.reduce((sum, bonus) => (
    sum + bonus.parameterBonus[0] + bonus.parameterBonus[1] + bonus.parameterBonus[2]
  ), 0));
  const eventPowerWithRoom = Math.floor(eventBonuses.reduce((sum, bonus) => (
    sum + bonus.parameterBonusWithRoom[0] + bonus.parameterBonusWithRoom[1] + bonus.parameterBonusWithRoom[2]
  ), 0));

  return {
    rank: 0,
    score: best.averageScore,
    targetValue,
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
    eventPointBase,
    eventPointMultiplier,
    eventPoint,
    eventPointOptions,
    eventMode,
    roomScore,
    supportBandPower: supportBand?.supportBandPower ?? null,
    supportCards: supportBand ? toSupportResultCards(supportBand.supportCards) : [],
    liveType,
    eventType,
    target,
    leaderCardId: cards[best.leaderIndex].cardId,
    skillOrderCardIds,
    skillOrderActors,
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

export function evaluateBandoriTeamByCardIds(
  input: BandoriTeamSearchInput,
  cardIds: readonly number[],
  configuration: BandoriAreaItemConfiguration,
  comboOptions?: ScoreComboOptions,
): BandoriTeamSearchResult | null {
  const server = input.server ?? 3;
  const perfectRate = clamp(input.perfectRate ?? 1, 0, 1);
  const chart = getCachedPreparedChart(input);
  const calculatedCards = buildCalculatedCards(input);
  const supportBandContext = createSupportBandContext(input, calculatedCards);
  const skillRateProfiles = buildSearchCardSkillRateProfiles(calculatedCards, input, chart, server);
  const searchCards = buildSearchCardsForConfiguration(
    calculatedCards,
    input,
    configuration,
    server,
    skillRateProfiles,
    supportBandContext,
  );
  const cardsById = new Map(searchCards.map((card) => [card.cardId, card]));
  const cards = cardIds.map((cardId) => cardsById.get(cardId));

  if (cards.length !== 5 || cards.some((card) => !card)) {
    return null;
  }

  const uniqueCardIds = new Set(cards.map((card) => card?.cardId));
  const uniqueCharacterIds = new Set(cards.map((card) => card?.characterId));
  if (uniqueCardIds.size !== 5 || uniqueCharacterIds.size !== 5) {
    return null;
  }

  return evaluateTeam(
    cards as SearchCard[],
    input,
    chart,
    configuration,
    server,
    perfectRate,
    {
      judgeLists: new Map(),
      innerScoreRates: new Map(),
      noFloorBaseScoreRates: new Map(),
      skillMultiplierLists: new Map(),
      noFloorSkillRates: new Map(),
      resolvedSkills: new Map(),
    },
    comboOptions,
    supportBandContext,
  );
}

function pushResult(results: BandoriTeamSearchResult[], result: BandoriTeamSearchResult, resultLimit: number): void {
  const cardSetKey = getTeamCardSetKey(result.cards);
  const existingIndex = results.findIndex((item) => getTeamCardSetKey(item.cards) === cardSetKey);
  if (existingIndex >= 0) {
    if (compareResults(results[existingIndex], result) <= 0) {
      return;
    }
    results.splice(existingIndex, 1);
  }
  results.push(result);
  sortResults(results);
  if (results.length > resultLimit) {
    results.pop();
  }
}

function createScoreCalculationCache(): ScoreCalculationCache {
  return {
    judgeLists: new Map(),
    innerScoreRates: new Map(),
    noFloorBaseScoreRates: new Map(),
    skillMultiplierLists: new Map(),
    noFloorSkillRates: new Map(),
    resolvedSkills: new Map(),
  };
}

function createInitialTeamSearchStats(options: {
  calculatedCardCount: number;
  rawConfigurationCount: number;
  configurationCount: number;
  usedEventBonus: boolean;
  eventMode: BandoriTeamSearchEventMode;
  useFever: boolean;
  supportBandContext: SupportBandContext;
}): BandoriTeamSearchStats {
  const { supportBandContext } = options;
  return {
    candidateCardCount: options.calculatedCardCount,
    rawAreaItemConfigurationCount: options.rawConfigurationCount,
    compressedCandidateCount: 0,
    areaItemConfigurationCount: options.configurationCount,
    prunedAreaItemConfigurationCount: options.rawConfigurationCount - options.configurationCount,
    enumeratedTeamCount: 0,
    evaluatedTeamCount: 0,
    targetOnlyEvaluationCount: 0,
    hydratedResultCount: 0,
    skippedHydrationCount: 0,
    duplicateTeamCount: 0,
    prunedBranchCount: 0,
    elapsedMs: 0,
    usedEventBonus: options.usedEventBonus,
    eventMode: options.eventMode,
    useFever: options.useFever,
    supportBandEnabled: supportBandContext.enabled,
    supportCandidateCount: supportBandContext.candidates.length,
    supportEvaluationCount: 0,
    skippedSupportByUpperBoundCount: 0,
    supportBandPowerUpperBound: supportBandContext.enabled ? supportBandContext.supportBandPowerUpperBound : null,
    supportAwareCompressionPrunedCount: 0,
    tightUpperBoundCount: 0,
    tightUpperBoundPrunedBranchCount: 0,
    secondLevelBoundCount: 0,
    secondLevelPrunedCount: 0,
    rootConfigSkippedCount: 0,
    isExhaustive: true,
    timedOut: false,
    searchMode: "exact",
    observedScoreUpperBound: null,
    observedScoreUpperBoundGap: null,
  };
}

function markTeamSearchTimedOut(stats: BandoriTeamSearchStats): void {
  stats.isExhaustive = false;
  stats.timedOut = true;
  stats.searchMode = "bounded";
}

function finishTeamSearchResponse(options: {
  results: BandoriTeamSearchResult[];
  stats: BandoriTeamSearchStats;
  supportBandContext: SupportBandContext;
  startedAt: number;
  resultLimit: number;
  observedScoreUpperBound: number;
}): BandoriTeamSearchResponse {
  const observedUpperBound = Number.isFinite(options.observedScoreUpperBound)
    ? Math.ceil(options.observedScoreUpperBound)
    : null;
  const comparisonScore = options.results[Math.min(options.resultLimit, options.results.length) - 1]?.score ?? null;
  const observedUpperBoundGap = options.stats.isExhaustive
    ? 0
    : observedUpperBound !== null && comparisonScore !== null
      ? Math.max(0, observedUpperBound - comparisonScore)
      : null;

  return {
    results: options.results,
    stats: {
      ...options.stats,
      supportEvaluationCount: options.supportBandContext.evaluationCount,
      skippedSupportByUpperBoundCount: options.supportBandContext.skippedByUpperBoundCount,
      secondLevelBoundCount: options.stats.tightUpperBoundCount,
      secondLevelPrunedCount: options.stats.tightUpperBoundPrunedBranchCount,
      elapsedMs: Math.round(performance.now() - options.startedAt),
      observedScoreUpperBound: options.stats.isExhaustive ? null : observedUpperBound,
      observedScoreUpperBoundGap: observedUpperBoundGap,
    },
  };
}

export function searchBandoriBestTeams(input: BandoriTeamSearchInput): BandoriTeamSearchResponse {
  const startedAt = performance.now();
  const server = input.server ?? 3;
  const resultLimit = clamp(Math.trunc(input.resultLimit ?? 10), 1, 50);
  const perfectRate = clamp(input.perfectRate ?? 1, 0, 1);
  const target = normalizeSearchTarget(input.target);
  const eventMode = resolveBandoriTeamSearchEventMode(input.eventType, input.liveType);
  const useFever = resolveBandoriTeamSearchUseFever(input);
  const maxSearchDurationMs = Math.max(1000, Math.trunc(input.maxSearchDurationMs ?? 9000));
  const deadlineAt = startedAt + maxSearchDurationMs;

  // 阶段 1：归一化输入并预计算和用户无关的谱面/技能/支援资料。
  const chart = getCachedPreparedChart(input);
  const calculatedCards = buildCalculatedCards(input);
  const supportBandContext = createSupportBandContext(input, calculatedCards);
  const objective = createSearchObjectiveAdapter(input, target, eventMode, supportBandContext);
  const rawConfigurations = createAreaItemConfigurations(input.userAreaItems);
  const prunedConfigurations = pruneDominatedAreaItemConfigurations(rawConfigurations, calculatedCards, input, server);
  const searchPrecomputed = buildSearchPrecomputedData(
    calculatedCards,
    input,
    prunedConfigurations,
    chart,
    server,
    supportBandContext,
  );
  const configurations = sortAreaItemConfigurationsForSearch(
    prunedConfigurations,
    calculatedCards,
    input,
    server,
    eventMode,
    searchPrecomputed,
  );

  // 阶段 2：运行时状态只保存搜索必要信息，详细展示字段延迟到命中 top-N 后构造。
  const skillRateProfiles = new Map(calculatedCards.map((card) => {
    const staticProfile = searchPrecomputed.cardStaticProfilesById.get(card.cardId);
    if (!staticProfile) {
      return [card.cardId, getCachedSearchCardSkillRateProfile(card, input, chart, server)] as const;
    }
    return [card.cardId, staticProfile] as const;
  }));
  const results: BandoriTeamSearchResult[] = [];
  const evaluatedTeamKeys = new Set<string>();
  const scoreCache = createScoreCalculationCache();
  const stats = createInitialTeamSearchStats({
    calculatedCardCount: calculatedCards.length,
    rawConfigurationCount: rawConfigurations.length,
    configurationCount: configurations.length,
    usedEventBonus: Boolean(input.eventBonus),
    eventMode,
    useFever,
    supportBandContext,
  });

  if (calculatedCards.length < 5 || chart.notesCount === 0) {
    return finishTeamSearchResponse({
      results: [],
      stats,
      supportBandContext,
      startedAt,
      resultLimit,
      observedScoreUpperBound: Number.NEGATIVE_INFINITY,
    });
  }

  const baseScoreRatePerPower = calculateBaseScoreRatePerPower(chart);
  let visitedBranchCount = 0;
  let observedScoreUpperBound = Number.NEGATIVE_INFINITY;
  const isPastDeadline = (): boolean => {
    visitedBranchCount += 1;
    return visitedBranchCount % 2048 === 0 && performance.now() >= deadlineAt;
  };
  const evaluateUniqueTeam = (
    cards: SearchCard[],
    configuration: BandoriAreaItemConfiguration,
  ): BandoriTeamSearchResult | null => {
    const key = getTeamEvaluationKey(cards, configuration);
    if (evaluatedTeamKeys.has(key)) {
      stats.duplicateTeamCount += 1;
      return null;
    }
    evaluatedTeamKeys.add(key);
    stats.evaluatedTeamCount += 1;
    stats.targetOnlyEvaluationCount += 1;
    const result = evaluateTeam(
      cards,
      input,
      chart,
      configuration,
      server,
      perfectRate,
      scoreCache,
      undefined,
      supportBandContext,
      getPruningThresholdResult(),
    );
    if (result) {
      stats.hydratedResultCount += 1;
    } else {
      stats.skippedHydrationCount += 1;
    }
    return result;
  };
  const getPruningThresholdResult = (): BandoriTeamSearchResult | undefined => results[resultLimit - 1];
  const configurationSearches: SearchConfiguration[] = [];
  const useContextPartitioning = calculatedCards.length >= 1800 || (target === "eventPoint" && eventMode === "pointBonus");

  // 阶段 3：逐区域配置建立 seed 和上界，先提高 top-N 阈值，再决定是否进入 DFS。
  for (const configuration of configurations) {
    if (performance.now() >= deadlineAt) {
      markTeamSearchTimedOut(stats);
      break;
    }

    const compressionResult = compressSearchCards(
      buildSearchCardsForConfiguration(
        calculatedCards,
        input,
        configuration,
        server,
        skillRateProfiles,
        supportBandContext,
        searchPrecomputed,
      ),
      objective,
    );
    const searchCards = compressionResult.cards;
    stats.supportAwareCompressionPrunedCount += compressionResult.prunedCount;
    const traversalCards = sortSearchCardsForTraversal(searchCards, baseScoreRatePerPower, target, eventMode, objective);
    stats.compressedCandidateCount += searchCards.length;
    const scopes = createSearchScopes(traversalCards, useContextPartitioning);

    for (const scope of scopes) {
      if (performance.now() >= deadlineAt) {
        markTeamSearchTimedOut(stats);
        break;
      }

      let scopeCards = groupSearchCardsByCharacter(scope.searchCards);
      let upperBoundIndex = buildCharacterUpperBoundIndex(scopeCards, scope.skillContextUpperMode);
      let rootScoreUpperBound = estimateSearchScopeScoreUpperBound(
        [],
        upperBoundIndex,
        scopeCards,
        0,
        0,
        0,
        baseScoreRatePerPower,
        scope.skillContextUpperMode,
      );
      let rootTargetUpperBound = estimateSearchScopeTargetUpperBoundFromScore(
        rootScoreUpperBound,
        [],
        upperBoundIndex,
        scopeCards,
        0,
        0,
        0,
        input,
        target,
        eventMode,
        scope.skillContextUpperMode,
        undefined,
        supportBandContext.supportBandPointUpperBound,
        objective,
      );
      observedScoreUpperBound = Math.max(observedScoreUpperBound, rootScoreUpperBound);
      if (results.length >= resultLimit && isSearchUpperBoundBelowResultThreshold(
        rootTargetUpperBound,
        rootScoreUpperBound,
        getPruningThresholdResult(),
      )) {
        stats.prunedBranchCount += 1;
        stats.rootConfigSkippedCount += 1;
        continue;
      }

      let seedScore = Number.NEGATIVE_INFINITY;
      let seedTargetValue = Number.NEGATIVE_INFINITY;

      for (const seedTeam of buildSeedTeams(scopeCards, target, eventMode, objective)) {
        if (performance.now() >= deadlineAt) {
          markTeamSearchTimedOut(stats);
          break;
        }
        if (!scopeOwnsCompleteTeam(seedTeam, scope.skillContextUpperMode)) {
          continue;
        }
        stats.enumeratedTeamCount += 1;
        const result = evaluateUniqueTeam(seedTeam, configuration);
        if (result) {
          seedScore = Math.max(seedScore, result.score);
          seedTargetValue = Math.max(seedTargetValue, result.targetValue);
          pushResult(results, result, resultLimit);
        }
      }
      if (stats.timedOut) {
        break;
      }

      const shouldPruneScopeCardsByInclusion = results.length >= resultLimit && (
        (target === "score" && useContextPartitioning)
        || (target === "eventPoint" && eventMode === "pointBonus")
      );
      if (shouldPruneScopeCardsByInclusion) {
        const prunedScopeCards = pruneCardsByInclusionTargetUpperBound(
          scopeCards,
          upperBoundIndex,
          baseScoreRatePerPower,
          getPruningThresholdResult(),
          input,
          target,
          eventMode,
          scope.skillContextUpperMode,
          supportBandContext.supportBandPointUpperBound,
          objective,
        );
        if (prunedScopeCards.length < scopeCards.length) {
          scopeCards = prunedScopeCards;
          upperBoundIndex = buildCharacterUpperBoundIndex(scopeCards, scope.skillContextUpperMode);
          rootScoreUpperBound = estimateSearchScopeScoreUpperBound(
            [],
            upperBoundIndex,
            scopeCards,
            0,
            0,
            0,
            baseScoreRatePerPower,
            scope.skillContextUpperMode,
          );
          rootTargetUpperBound = estimateSearchScopeTargetUpperBoundFromScore(
            rootScoreUpperBound,
            [],
            upperBoundIndex,
            scopeCards,
            0,
            0,
            0,
            input,
            target,
            eventMode,
            scope.skillContextUpperMode,
            undefined,
            supportBandContext.supportBandPointUpperBound,
            objective,
          );
          observedScoreUpperBound = Math.max(observedScoreUpperBound, rootScoreUpperBound);
        }
      }
      if (results.length >= resultLimit && isSearchUpperBoundBelowResultThreshold(
        rootTargetUpperBound,
        rootScoreUpperBound,
        getPruningThresholdResult(),
      )) {
        stats.prunedBranchCount += 1;
        stats.rootConfigSkippedCount += 1;
        continue;
      }

      configurationSearches.push({
        configuration,
        searchCards: scopeCards,
        upperBoundIndex,
        seedScore,
        seedTargetValue,
        rootScoreUpperBound,
        rootTargetUpperBound,
        skillContextUpperMode: scope.skillContextUpperMode,
      });
    }
    if (stats.timedOut) {
      break;
    }
  }

  configurationSearches.sort((left, right) => (
    compareUpperBoundDesc(left.seedTargetValue, right.seedTargetValue)
    || compareUpperBoundDesc(left.seedScore, right.seedScore)
    || compareUpperBoundDesc(left.rootTargetUpperBound, right.rootTargetUpperBound)
    || right.rootScoreUpperBound - left.rootScoreUpperBound
    || (right.searchCards[0]?.effectivePower ?? 0) - (left.searchCards[0]?.effectivePower ?? 0)
    || right.searchCards.length - left.searchCards.length
  ));

  // 阶段 4：精确 DFS。任何剪枝都必须来自乐观上界，不能依赖固定 Top-K 裁剪。
  for (const search of configurationSearches) {
    if (performance.now() >= deadlineAt) {
      markTeamSearchTimedOut(stats);
      break;
    }

    const { configuration, skillContextUpperMode } = search;
    let searchCards = search.searchCards;
    let upperBoundIndex = search.upperBoundIndex;
    const shouldPruneSearchCardsByInclusion = results.length >= resultLimit && (
      (target === "score" && useContextPartitioning)
      || (target === "eventPoint" && eventMode === "pointBonus")
    );
    if (shouldPruneSearchCardsByInclusion) {
      const prunedSearchCards = pruneCardsByInclusionTargetUpperBound(
        searchCards,
        upperBoundIndex,
        baseScoreRatePerPower,
        getPruningThresholdResult(),
        input,
        target,
        eventMode,
        skillContextUpperMode,
        supportBandContext.supportBandPointUpperBound,
        objective,
      );
      if (prunedSearchCards.length < searchCards.length) {
        searchCards = prunedSearchCards;
        upperBoundIndex = buildCharacterUpperBoundIndex(searchCards, skillContextUpperMode);
      }
      const rootScoreUpperBound = estimateSearchScopeScoreUpperBound(
        [],
        upperBoundIndex,
        searchCards,
        0,
        0,
        0,
        baseScoreRatePerPower,
        skillContextUpperMode,
      );
      observedScoreUpperBound = Math.max(observedScoreUpperBound, rootScoreUpperBound);
      const rootTargetUpperBound = estimateSearchScopeTargetUpperBoundFromScore(
        rootScoreUpperBound,
        [],
        upperBoundIndex,
        searchCards,
        0,
        0,
        0,
        input,
        target,
        eventMode,
        skillContextUpperMode,
        undefined,
        supportBandContext.supportBandPointUpperBound,
        objective,
      );
      if (isSearchUpperBoundBelowResultThreshold(rootTargetUpperBound, rootScoreUpperBound, getPruningThresholdResult())) {
        stats.prunedBranchCount += 1;
        stats.rootConfigSkippedCount += 1;
        continue;
      }
    }
    const selectedCards: SearchCard[] = [];
    const searchCardGroups = buildSearchCardGroups(searchCards, upperBoundIndex);
    let selectedPower = 0;
    let selectedPointBonusRate = 0;
    let selectedSkillAverageRate = 0;
    let selectedSkillLeaderRate = 0;
    let usedCharacterMaskLow = 0;
    let usedCharacterMaskHigh = 0;

    const visit = (groupIndex: number): void => {
      if (stats.timedOut || isPastDeadline()) {
        markTeamSearchTimedOut(stats);
        return;
      }

      const remaining = 5 - selectedCards.length;
      const startIndex = searchCardGroups[groupIndex]?.startIndex ?? searchCards.length;
      if (remaining === 0) {
        if (!scopeOwnsCompleteTeam(selectedCards, skillContextUpperMode)) {
          return;
        }
        if (results.length >= resultLimit) {
          const completeTeamScoreUpperBound = estimateSearchScopeScoreUpperBound(
            selectedCards,
            upperBoundIndex,
            searchCards,
            startIndex,
            usedCharacterMaskLow,
            usedCharacterMaskHigh,
            baseScoreRatePerPower,
            skillContextUpperMode,
            selectedPower,
            skillContextUpperMode ? selectedSkillAverageRate : undefined,
            skillContextUpperMode ? selectedSkillLeaderRate : undefined,
          );
          const completeTeamTargetUpperBound = estimateSearchScopeTargetUpperBoundFromScore(
            completeTeamScoreUpperBound,
            selectedCards,
            upperBoundIndex,
            searchCards,
            startIndex,
            usedCharacterMaskLow,
            usedCharacterMaskHigh,
            input,
            target,
            eventMode,
            skillContextUpperMode,
            selectedPointBonusRate,
            supportBandContext.supportBandPointUpperBound,
            objective,
          );
          observedScoreUpperBound = Math.max(observedScoreUpperBound, completeTeamScoreUpperBound);
          if (isSearchUpperBoundBelowResultThreshold(
            completeTeamTargetUpperBound,
            completeTeamScoreUpperBound,
            getPruningThresholdResult(),
          )) {
            stats.prunedBranchCount += 1;
            return;
          }
          if (shouldUseCorrelatedUpperBound(completeTeamTargetUpperBound, getPruningThresholdResult(), objective)) {
            stats.tightUpperBoundCount += 1;
            const tightTargetUpperBound = estimateCorrelatedSearchScopeTargetUpperBound(
              selectedCards,
              upperBoundIndex,
              searchCards,
              startIndex,
              usedCharacterMaskLow,
              usedCharacterMaskHigh,
              baseScoreRatePerPower,
              input,
              objective,
              skillContextUpperMode,
              selectedPower,
              skillContextUpperMode ? selectedSkillAverageRate : undefined,
              skillContextUpperMode ? selectedSkillLeaderRate : undefined,
              selectedPointBonusRate,
            );
            if (
              tightTargetUpperBound !== null
              && isSearchUpperBoundBelowResultThreshold(
                tightTargetUpperBound,
                completeTeamScoreUpperBound,
                getPruningThresholdResult(),
              )
            ) {
              stats.prunedBranchCount += 1;
              stats.tightUpperBoundPrunedBranchCount += 1;
              return;
            }
          }
        }
        stats.enumeratedTeamCount += 1;
        const result = evaluateUniqueTeam(selectedCards, configuration);
        if (result) {
          pushResult(results, result, resultLimit);
        }
        return;
      }

      if (searchCardGroups.length - groupIndex < remaining) {
        return;
      }

      if (results.length >= resultLimit) {
        const branchScoreUpperBound = estimateSearchScopeScoreUpperBound(
          selectedCards,
          upperBoundIndex,
          searchCards,
          startIndex,
          usedCharacterMaskLow,
          usedCharacterMaskHigh,
          baseScoreRatePerPower,
          skillContextUpperMode,
          selectedPower,
          skillContextUpperMode ? selectedSkillAverageRate : undefined,
          skillContextUpperMode ? selectedSkillLeaderRate : undefined,
        );
        const branchTargetUpperBound = estimateSearchScopeTargetUpperBoundFromScore(
          branchScoreUpperBound,
          selectedCards,
          upperBoundIndex,
          searchCards,
          startIndex,
          usedCharacterMaskLow,
          usedCharacterMaskHigh,
          input,
          target,
          eventMode,
          skillContextUpperMode,
          selectedPointBonusRate,
          supportBandContext.supportBandPointUpperBound,
          objective,
        );
        observedScoreUpperBound = Math.max(observedScoreUpperBound, branchScoreUpperBound);
        if (isSearchUpperBoundBelowResultThreshold(
          branchTargetUpperBound,
          branchScoreUpperBound,
          getPruningThresholdResult(),
        )) {
          stats.prunedBranchCount += 1;
          return;
        }
        if (shouldUseCorrelatedUpperBound(branchTargetUpperBound, getPruningThresholdResult(), objective)) {
          stats.tightUpperBoundCount += 1;
          const tightTargetUpperBound = estimateCorrelatedSearchScopeTargetUpperBound(
            selectedCards,
            upperBoundIndex,
            searchCards,
            startIndex,
            usedCharacterMaskLow,
            usedCharacterMaskHigh,
            baseScoreRatePerPower,
            input,
            objective,
            skillContextUpperMode,
            selectedPower,
            skillContextUpperMode ? selectedSkillAverageRate : undefined,
            skillContextUpperMode ? selectedSkillLeaderRate : undefined,
            selectedPointBonusRate,
          );
          if (
            tightTargetUpperBound !== null
            && isSearchUpperBoundBelowResultThreshold(
              tightTargetUpperBound,
              branchScoreUpperBound,
              getPruningThresholdResult(),
            )
          ) {
            stats.prunedBranchCount += 1;
            stats.tightUpperBoundPrunedBranchCount += 1;
            return;
          }
        }
      }

      if (searchCardGroups.length - groupIndex > remaining) {
        visit(groupIndex + 1);
        if (stats.timedOut) {
          return;
        }
      }

      const group = searchCardGroups[groupIndex];
      if (!group || hasCharacterIndexInMask(usedCharacterMaskLow, usedCharacterMaskHigh, group.characterIndex)) {
        return;
      }
      for (const card of group.cards) {
        const characterIndex = group.characterIndex;
        const isLowCharacterMask = characterIndex < CHARACTER_MASK_SEGMENT_BITS;
        const characterBit = isLowCharacterMask
          ? 1 << characterIndex
          : 1 << (characterIndex - CHARACTER_MASK_SEGMENT_BITS);

        selectedCards.push(card);
        selectedPower += card.effectivePower;
        selectedPointBonusRate += card.pointBonusRate;
        const previousSkillLeaderRate = selectedSkillLeaderRate;
        const cardSkillAverageRate = skillContextUpperMode
          ? getCardSkillAverageRateForUpperMode(card, skillContextUpperMode)
          : 0;
        if (skillContextUpperMode) {
          selectedSkillAverageRate += cardSkillAverageRate;
          selectedSkillLeaderRate = Math.max(
            selectedSkillLeaderRate,
            getCardSkillLeaderRateForUpperMode(card, skillContextUpperMode),
          );
        }
        if (isLowCharacterMask) {
          usedCharacterMaskLow |= characterBit;
        } else {
          usedCharacterMaskHigh |= characterBit;
        }
        visit(groupIndex + 1);
        if (isLowCharacterMask) {
          usedCharacterMaskLow &= ~characterBit;
        } else {
          usedCharacterMaskHigh &= ~characterBit;
        }
        if (skillContextUpperMode) {
          selectedSkillLeaderRate = previousSkillLeaderRate;
          selectedSkillAverageRate -= cardSkillAverageRate;
        }
        selectedPointBonusRate -= card.pointBonusRate;
        selectedPower -= card.effectivePower;
        selectedCards.pop();
        if (stats.timedOut) {
          return;
        }
      }
    };

    visit(0);
  }

  sortResults(results);
  return finishTeamSearchResponse({
    results,
    stats,
    supportBandContext,
    startedAt,
    resultLimit,
    observedScoreUpperBound,
  });
}

export function isBandoriTeamSearchDifficulty(value: string): value is BandoriTeamSearchDifficulty {
  return (BANDORI_TEAM_SEARCH_DIFFICULTIES as readonly string[]).includes(value);
}

export type {
  BandoriMedleySongSearchInput,
  BandoriMedleyTeamSearchInput,
  BandoriMedleyTeamSearchResult,
  BandoriMedleyTeamSearchProfilingStats,
  BandoriMedleyTeamSearchStats,
  BandoriMedleyTeamSearchResponse,
} from "@/lib/bandori-medley-team-search";
export { searchBandoriBestMedleyTeams } from "@/lib/bandori-medley-team-search";
