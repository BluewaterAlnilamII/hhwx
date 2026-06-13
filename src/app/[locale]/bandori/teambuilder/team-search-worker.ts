import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import {
  searchBandoriBestTeams,
  type BandoriTeamSearchDifficulty,
  type BandoriTeamSearchConstraints,
  type BandoriTeamSearchEventType,
  type BandoriTeamSearchExternalSkill,
  type BandoriTeamSearchLiveType,
  type BandoriTeamSearchResponse,
  type BandoriTeamSearchTarget,
  type BestdoriChartEntity,
  type BestdoriSongMaster,
} from "@/lib/bandori-team-search";
import {
  searchBandoriBestMedleyTeams,
  type BandoriMedleySongSearchInput,
  type BandoriMedleyTeamSearchResult,
  type BandoriMedleyTeamSearchInput,
  type BandoriMedleyTeamSearchResponse,
  type BandoriMedleyTeamSearchStats,
} from "@/lib/bandori/team-builder/medley";
import {
  buildCalculatedCards,
  createAreaItemConfigurations,
  pruneDominatedAreaItemConfigurations,
} from "@/lib/bandori/team-builder/core";
import { estimateMedleyStaticCoarsePotential } from "@/lib/bandori/team-builder/medley/configurations";
import {
  buildMedleyResult,
  createMedleyEvaluatedCandidateTracker,
  pushMedleyResult,
  sortMedleyResults,
} from "@/lib/bandori/team-builder/medley/results";
import {
  getMedleyGreedySeedSlotIndices,
} from "@/lib/bandori/team-builder/medley/seeds";
import {
  buildMedleySlotBuildContexts,
  buildMedleySlotSearches,
  createMedleySlotInput,
  estimateMedleySlotAvailability,
  findBestMedleySlotTeamWithCache,
  pruneDominatedMedleySlotCards,
} from "@/lib/bandori/team-builder/medley/slots";
import { createInitialMedleyProfilingStats } from "@/lib/bandori/team-builder/medley/profiling";
import { buildBandoriCharacterBonuses } from "@/lib/bandori-character-bonuses";
import type {
  MedleyBestSlotTeamCacheEntry,
  MedleyTeamCandidate,
} from "@/lib/bandori/team-builder/medley/types";
import {
  type BandoriEventBonus,
  type BestdoriAreaItemMaster,
  type BestdoriCardMaster,
  type BestdoriSkillMaster,
} from "@/lib/bandori-team-calculator";
import {
  getGameProfileAreaItems,
  getGameProfileCards,
  getGameProfileCharacterMissionBonuses,
  getGameProfileCharacterPotentials,
  type UserGameProfileCardRecord,
  type UserGameProfilePayload,
} from "@/lib/user-game-profile-payload";

type MasterResponse<T> = {
  payload: T;
};

type CardPreferenceRarityThreshold = 3 | 4 | 5;

type OwnedCardParameterPreferences = {
  maxLevelEpisodeTraining: boolean;
  maxMasterRank: boolean;
  maxMasterRankRarityThreshold: CardPreferenceRarityThreshold;
  maxSkillLevel: boolean;
  maxSkillLevelRarityThreshold: CardPreferenceRarityThreshold;
};

type EventBonusResponse = {
  bonuses: BandoriEventBonus[];
};

const MEDLEY_FRONTEND_MEMORY_SOFT_LIMIT_MIB = 2800;
type MedleyCalculationMode = "maximize" | "legacy-greedy-single";

type TeamSearchWorkerSearchRequest = {
  type: "search";
  requestId: string;
  profilePayload: UserGameProfilePayload;
  event: {
    eventId?: number;
    eventType: BandoriTeamSearchEventType;
    formula: 0 | 1 | 2;
    bonusOverride?: Partial<BandoriEventBonus>;
  };
  live: {
    type: BandoriTeamSearchLiveType;
    useSpecialRoomBonus: boolean;
    roomPower?: number;
    otherPlayersAveragePower?: number;
    otherPlayerSkills?: BandoriTeamSearchExternalSkill[];
    encoreSkillSource?: "self" | "other1" | "other2" | "other3" | "other4";
    liveBoostCount?: 0 | 1 | 2 | 3;
    challengeCpCost?: 200 | 400 | 800 | 1600;
  };
  song: {
    songId: number;
    difficulty: BandoriTeamSearchDifficulty;
    perfectRate: number;
  };
  songs?: Array<{
    songId: number;
    difficulty: BandoriTeamSearchDifficulty;
  }>;
  cards: {
    excludedCardIds: number[];
    ownedCardParameters?: OwnedCardParameterPreferences;
    temporaryCards: Array<UserGameProfileCardRecord & { instanceId?: string; cardInstanceKey?: string }>;
  };
  calculation: {
    target: BandoriTeamSearchTarget;
    resultLimit: number;
    maxSearchDurationMs: number;
    medleyMode?: MedleyCalculationMode;
    constraints?: BandoriTeamSearchConstraints;
  };
};

export type TeamSearchWorkerPreloadRequest = {
  type: "preload";
  requestId: string;
  song?: {
    songId: number;
    difficulty: BandoriTeamSearchDifficulty;
  };
  songs?: Array<{
    songId: number;
    difficulty: BandoriTeamSearchDifficulty;
  }>;
  event?: {
    eventId?: number;
  };
};

export type TeamSearchWorkerRequest = TeamSearchWorkerSearchRequest;

export type TeamSearchWorkerMessage = TeamSearchWorkerPreloadRequest | TeamSearchWorkerSearchRequest;

export type TeamSearchWorkerResponse =
  | {
      requestId: string;
      type: "preload";
      ok: true;
    }
  | {
      requestId: string;
      type: "search";
      ok: true;
      result: BandoriTeamSearchResponse | BandoriMedleyTeamSearchResponse;
    }
  | {
      requestId: string;
      type: "search-progress";
      ok: true;
      partial: true;
      result: BandoriMedleyTeamSearchResponse;
    }
  | {
      requestId: string;
      type: "preload" | "search";
      ok: false;
      error: string;
    };

type TeamSearchWorkerRunOptions = {
  onMedleyProgress?: (result: BandoriMedleyTeamSearchResponse) => void;
};

const requestJsonCache = new Map<string, Promise<unknown>>();

async function requestJson<T>(path: string): Promise<T> {
  const cached = requestJsonCache.get(path);
  if (cached) {
    return cached as Promise<T>;
  }

  const promise = requestJsonUncached<T>(path).catch((error) => {
    requestJsonCache.delete(path);
    throw error;
  });
  requestJsonCache.set(path, promise);
  return promise;
}

async function requireCachedJson<T>(path: string, label: string): Promise<T> {
  const cached = requestJsonCache.get(path);
  if (!cached) {
    throw new Error(`${label}尚未准备完成`);
  }
  return cached as Promise<T>;
}

async function requestJsonUncached<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload) || `请求失败（HTTP ${response.status}）`);
  }

  const data = parseApiSuccessData<T>(payload);
  if (data === null) {
    throw new Error("接口返回格式无效");
  }
  return data;
}

function mergeEventBonus(base: BandoriEventBonus | null, override: Partial<BandoriEventBonus> | undefined): BandoriEventBonus | null {
  if (!override) {
    return base;
  }

  const merged: BandoriEventBonus = { ...(base ?? {}) };
  (Object.keys(override) as Array<keyof BandoriEventBonus>).forEach((key) => {
    const value = override[key];
    if (value !== undefined && value !== null) {
      Object.assign(merged, { [key]: value });
    }
  });
  return Object.keys(merged).length > 0 ? merged : null;
}

function readPositiveInteger(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.trunc(numeric);
}

function getMasterCardRarity(card: BestdoriCardMaster | undefined): number {
  return readPositiveInteger(card?.rarity, 0);
}

function hasMasterCardTraining(card: BestdoriCardMaster | undefined): boolean {
  return typeof card?.stat?.training === "object" && card.stat.training !== null;
}

function getMasterCardMaxLevel(card: BestdoriCardMaster | undefined): number {
  if (!card) {
    return 0;
  }
  const baseLevelLimit = Math.max(1, readPositiveInteger(card.levelLimit, 1));
  const trainingLevelLimit = hasMasterCardTraining(card)
    ? Math.max(0, readPositiveInteger(card.stat?.training?.levelLimit, 0))
    : 0;
  return baseLevelLimit + trainingLevelLimit;
}

function getMasterCardMaxEpisodeCount(card: BestdoriCardMaster | undefined): number {
  if (!card) {
    return 2;
  }
  return Math.min(2, Math.max(0, Array.isArray(card.stat?.episodes) ? card.stat.episodes.length : 2));
}

function applyOwnedCardParameterPreferences(
  card: UserGameProfileCardRecord,
  masterCard: BestdoriCardMaster | undefined,
  preferences: OwnedCardParameterPreferences | undefined,
): UserGameProfileCardRecord {
  if (!preferences || !masterCard) {
    return card;
  }

  const rarity = getMasterCardRarity(masterCard);
  const hasTraining = hasMasterCardTraining(masterCard);
  const nextCard: UserGameProfileCardRecord = { ...card };

  if (preferences.maxLevelEpisodeTraining) {
    nextCard.level = Math.max(nextCard.level, getMasterCardMaxLevel(masterCard) || nextCard.level);
    nextCard.episodeCount = Math.max(nextCard.episodeCount, getMasterCardMaxEpisodeCount(masterCard));
    if (hasTraining) {
      nextCard.isTrained = true;
      nextCard.hasTrainedArt = true;
    }
  }

  if (preferences.maxMasterRank && rarity > 0 && rarity <= preferences.maxMasterRankRarityThreshold) {
    nextCard.masterRank = 4;
  }

  if (preferences.maxSkillLevel && rarity > 0 && rarity <= preferences.maxSkillLevelRarityThreshold) {
    nextCard.skillLevel = 5;
  }

  return nextCard;
}

function buildMedleyGreedySlotOrders(slotCount: number, preferredOrder: number[]): number[][] {
  if (slotCount === 3) {
    return [[2, 1, 0]];
  }
  return preferredOrder.length === slotCount
    ? [preferredOrder]
    : [Array.from({ length: slotCount }, (_, index) => slotCount - index - 1)];
}

function buildSharedConfigurationLegacyGreedyMedleyResponse({
  input,
  songInputs,
  server,
  perfectRate,
  resultLimit,
  startedAt,
  deadlineAt,
}: {
  input: BandoriMedleyTeamSearchInput;
  songInputs: BandoriMedleySongSearchInput[];
  server: number;
  perfectRate: number;
  resultLimit: number;
  startedAt: number;
  deadlineAt: number;
}): BandoriMedleyTeamSearchResponse {
  const firstSongInput = songInputs[0];
  if (!firstSongInput) {
    const profiling = createInitialMedleyProfilingStats(0);
    return {
      results: [],
      maxScoreCandidate: null,
      evaluatedAverageTopCandidates: [],
      stats: {
        candidateCardCount: 0,
        rawAreaItemConfigurationCount: 0,
        areaItemConfigurationCount: 0,
        prunedAreaItemConfigurationCount: 0,
        enumeratedTeamCount: 0,
        evaluatedTeamCount: 0,
        prunedBranchCount: 0,
        elapsedMs: Math.round(performance.now() - startedAt),
        isExhaustive: false,
        timedOut: false,
        memoryLimited: false,
        memorySoftLimitMiB: null,
        peakUsedHeapMiB: null,
        searchMode: null,
        observedScoreUpperBound: null,
        observedScoreUpperBoundGap: null,
        profiling,
      },
    };
  }

  const firstSlotInput = createMedleySlotInput(input, firstSongInput);
  const calculatedCards = buildCalculatedCards(firstSlotInput);
  const rawConfigurations = createAreaItemConfigurations(input.userAreaItems);
  const configurations = pruneDominatedAreaItemConfigurations(rawConfigurations, calculatedCards, firstSlotInput, server);
  const orderedConfigurations = configurations
    .map((configuration, index) => ({
      configuration,
      index,
      potential: estimateMedleyStaticCoarsePotential(input, calculatedCards, configuration),
    }))
    .sort((left, right) => right.potential - left.potential || left.index - right.index)
    .map(({ configuration }) => configuration);
  const profiling = createInitialMedleyProfilingStats(configurations.length);
  const stats: BandoriMedleyTeamSearchStats = {
    candidateCardCount: calculatedCards.length,
    rawAreaItemConfigurationCount: rawConfigurations.length,
    areaItemConfigurationCount: configurations.length,
    prunedAreaItemConfigurationCount: rawConfigurations.length - configurations.length,
    enumeratedTeamCount: 0,
    evaluatedTeamCount: 0,
    prunedBranchCount: 0,
    elapsedMs: 0,
    isExhaustive: false,
    timedOut: false,
    memoryLimited: false,
    memorySoftLimitMiB: null,
    peakUsedHeapMiB: null,
    searchMode: null,
    observedScoreUpperBound: null,
    observedScoreUpperBoundGap: null,
    profiling,
  };
  const results: BandoriMedleyTeamSearchResult[] = [];
  const evaluatedCandidateTracker = createMedleyEvaluatedCandidateTracker();
  const observeEvaluatedMedleyResult = evaluatedCandidateTracker.observe;
  const buildContexts = buildMedleySlotBuildContexts(input, songInputs, calculatedCards, server);
  const getPruningThreshold = (): number => (
    results.length >= resultLimit
      ? results[resultLimit - 1]?.score ?? Number.NEGATIVE_INFINITY
      : Number.NEGATIVE_INFINITY
  );
  const isPastDeadline = (): boolean => {
    const timedOut = performance.now() >= deadlineAt;
    if (timedOut) {
      stats.timedOut = true;
    }
    return timedOut;
  };

  for (const configuration of orderedConfigurations) {
    if (isPastDeadline()) {
      break;
    }
    profiling.startedAreaItemConfigurationCount += 1;
    const slots = pruneDominatedMedleySlotCards(buildMedleySlotSearches(
      input,
      songInputs,
      calculatedCards,
      configuration,
      server,
      buildContexts,
    ));
    const configurationRootUpperBound = slots.reduce((sum, slot) => sum + slot.rootScoreUpperBound, 0);
    const currentThreshold = getPruningThreshold();
    if (Number.isFinite(currentThreshold) && configurationRootUpperBound < currentThreshold) {
      profiling.rootUpperPrunedConfigurationCount += 1;
      profiling.rootUpperBestConfigurationUpperBound = Math.max(
        profiling.rootUpperBestConfigurationUpperBound ?? Number.NEGATIVE_INFINITY,
        configurationRootUpperBound,
      );
      continue;
    }
    const seedOrders = buildMedleyGreedySlotOrders(slots.length, getMedleyGreedySeedSlotIndices(slots));
    const bestSlotTeamCache = new Map<string, MedleyBestSlotTeamCacheEntry>();
    const getRemainingScoreUpperBound = (
      remainingSlotIndices: number[],
      bannedCardIds: Set<number>,
    ): number => remainingSlotIndices.reduce((sum, remainingSlotIndex) => (
      sum + estimateMedleySlotAvailability(slots[remainingSlotIndex], bannedCardIds, bannedCardIds, profiling).scoreUpperBound
    ), 0);
    let completedConfiguration = false;

    for (const seedOrder of seedOrders) {
      const selectedBySong: Array<MedleyTeamCandidate | undefined> = [];
      const bannedCardIds = new Set<number>();
      let completedSeedOrder = true;
      let currentScore = 0;

      for (let orderIndex = 0; orderIndex < seedOrder.length; orderIndex += 1) {
        const slotIndex = seedOrder[orderIndex];
        const remainingSlotIndices = seedOrder.slice(orderIndex + 1);
        if (isPastDeadline()) {
          completedSeedOrder = false;
          break;
        }
        const slot = slots[slotIndex];
        const threshold = getPruningThreshold();
        const remainingScoreUpperBound = Number.isFinite(threshold)
          ? getRemainingScoreUpperBound(remainingSlotIndices, bannedCardIds)
          : Number.POSITIVE_INFINITY;
        const minimumScore = Number.isFinite(threshold)
          ? threshold - currentScore - remainingScoreUpperBound
          : Number.NEGATIVE_INFINITY;
        const candidate = findBestMedleySlotTeamWithCache(
          bestSlotTeamCache,
          slotIndex,
          slot,
          bannedCardIds,
          bannedCardIds,
          server,
          perfectRate,
          stats,
          isPastDeadline,
          () => undefined,
          profiling,
          minimumScore,
        );
        if (!candidate) {
          if (Number.isFinite(minimumScore)) {
            stats.prunedBranchCount += 1;
          }
          completedSeedOrder = false;
          break;
        }
        selectedBySong[slot.songIndex] = candidate;
        for (const card of candidate.cards) {
          bannedCardIds.add(card.cardId);
        }
        currentScore += candidate.result.score;
        if (Number.isFinite(threshold)) {
          const nextRemainingScoreUpperBound = getRemainingScoreUpperBound(remainingSlotIndices, bannedCardIds);
          if (currentScore + nextRemainingScoreUpperBound < threshold) {
            stats.prunedBranchCount += 1;
            completedSeedOrder = false;
            break;
          }
        }
      }

      const result = completedSeedOrder
        ? buildMedleyResult(slots, selectedBySong, configuration)
        : null;
      if (result) {
        completedConfiguration = true;
        pushMedleyResult(results, result, resultLimit, observeEvaluatedMedleyResult);
        profiling.bestGreedySeedScore = Math.max(profiling.bestGreedySeedScore ?? Number.NEGATIVE_INFINITY, result.score);
        if (seedOrder.map((slotIndex) => slots[slotIndex].songIndex).join(",") === "2,1,0") {
          profiling.reverseSongOrderGreedySeedScore = Math.max(
            profiling.reverseSongOrderGreedySeedScore ?? Number.NEGATIVE_INFINITY,
            result.score,
          );
        }
      }
      if (stats.timedOut) {
        break;
      }
    }

    if (completedConfiguration) {
      profiling.completedAreaItemConfigurationCount += 1;
    }
    if (stats.timedOut) {
      break;
    }
  }
  sortMedleyResults(results);
  if (profiling.bestGreedySeedScore === Number.NEGATIVE_INFINITY) {
    profiling.bestGreedySeedScore = null;
  }
  stats.elapsedMs = Math.round(performance.now() - startedAt);

  const maxScoreCandidate = evaluatedCandidateTracker.getMaxScoreCandidate(results[0] ?? null);
  return {
    results,
    maxScoreCandidate,
    evaluatedAverageTopCandidates: evaluatedCandidateTracker.getEvaluatedAverageTopCandidates(
      maxScoreCandidate ? [...results, maxScoreCandidate] : results,
    ),
    stats,
  };
}

function buildLegacyGreedyMedleyInput({
  userCards,
  userAreaItems,
  characterBonuses,
  cardsById,
  charactersById,
  skillsById,
  areaItemsById,
  songs,
  eventBonus,
  eventFormula,
  perfectRate,
  server,
}: {
  userCards: BandoriMedleyTeamSearchInput["userCards"];
  userAreaItems: BandoriMedleyTeamSearchInput["userAreaItems"];
  characterBonuses: BandoriMedleyTeamSearchInput["characterBonuses"];
  cardsById: BandoriMedleyTeamSearchInput["cardsById"];
  charactersById: BandoriMedleyTeamSearchInput["charactersById"];
  skillsById: BandoriMedleyTeamSearchInput["skillsById"];
  areaItemsById: BandoriMedleyTeamSearchInput["areaItemsById"];
  songs: BandoriMedleySongSearchInput[];
  eventBonus: BandoriMedleyTeamSearchInput["eventBonus"];
  eventFormula: 0 | 1 | 2;
  perfectRate: number;
  server: number;
}): BandoriMedleyTeamSearchInput {
  return {
    userCards,
    userAreaItems,
    characterBonuses,
    cardsById,
    charactersById,
    skillsById,
    areaItemsById,
    songs,
    eventBonus,
    eventType: "medley",
    eventFormula,
    target: "score",
    resultLimit: 1,
    perfectRate,
    useSpecialRoomBonus: false,
    server,
  };
}

async function preloadSearchData(request: TeamSearchWorkerPreloadRequest): Promise<void> {
  const preloadRequests: Array<Promise<unknown>> = [
    requestJson<MasterResponse<Record<string, BestdoriCardMaster | undefined>>>("/api/bandori/master/cards"),
    requestJson<MasterResponse<Record<string, { bandId?: number | null } | undefined>>>("/api/bandori/master/characters/main"),
    requestJson<MasterResponse<Record<string, BestdoriSkillMaster | undefined>>>("/api/bandori/master/skills"),
    requestJson<MasterResponse<Record<string, BestdoriAreaItemMaster | undefined>>>("/api/bandori/master/areaItems"),
    requestJson<MasterResponse<Record<string, BestdoriSongMaster | undefined>>>("/api/bandori/master/songs"),
  ];

  if (request.song) {
    const songId = Math.trunc(request.song.songId);
    preloadRequests.push(requestJson<{ chart: BestdoriChartEntity[] }>(`/api/bandori/charts/${songId}/${request.song.difficulty}`));
  }
  for (const song of request.songs ?? []) {
    const songId = Math.trunc(song.songId);
    preloadRequests.push(requestJson<{ chart: BestdoriChartEntity[] }>(`/api/bandori/charts/${songId}/${song.difficulty}`));
  }

  if (request.event?.eventId) {
    preloadRequests.push(requestJson<EventBonusResponse>(`/api/bandori/events/bonuses?event=${request.event.eventId}`));
  }

  await Promise.all(preloadRequests);
}

async function runSearch(
  request: TeamSearchWorkerSearchRequest,
  options: TeamSearchWorkerRunOptions = {},
): Promise<BandoriTeamSearchResponse | BandoriMedleyTeamSearchResponse> {
  const songId = Math.trunc(request.song.songId);
  const medleySongs = request.event.eventType === "medley" ? request.songs?.slice(0, 3) ?? [] : [];
  const chartRequests = medleySongs.length > 0
    ? medleySongs.map((song) => (
      requireCachedJson<{ chart: BestdoriChartEntity[] }>(
        `/api/bandori/charts/${Math.trunc(song.songId)}/${song.difficulty}`,
        "谱面数据",
      )
    ))
    : [
      requireCachedJson<{ chart: BestdoriChartEntity[] }>(
        `/api/bandori/charts/${songId}/${request.song.difficulty}`,
        "谱面数据",
      ),
    ];
  const [cardsPayload, charactersPayload, skillsPayload, areaItemsPayload, songsPayload, chartPayloads, eventBonuses] = await Promise.all([
    requireCachedJson<MasterResponse<Record<string, BestdoriCardMaster | undefined>>>("/api/bandori/master/cards", "卡牌数据"),
    requireCachedJson<MasterResponse<Record<string, { bandId?: number | null } | undefined>>>("/api/bandori/master/characters/main", "角色数据"),
    requireCachedJson<MasterResponse<Record<string, BestdoriSkillMaster | undefined>>>("/api/bandori/master/skills", "技能数据"),
    requireCachedJson<MasterResponse<Record<string, BestdoriAreaItemMaster | undefined>>>("/api/bandori/master/areaItems", "区域道具数据"),
    requireCachedJson<MasterResponse<Record<string, BestdoriSongMaster | undefined>>>("/api/bandori/master/songs", "歌曲数据"),
    Promise.all(chartRequests),
    request.event.eventId
      ? requireCachedJson<EventBonusResponse>(`/api/bandori/events/bonuses?event=${request.event.eventId}`, "活动加成").then((response) => response.bonuses)
      : Promise.resolve([]),
  ]);

  const song = songsPayload.payload[String(songId)];
  if (!song) {
    throw new Error("歌曲数据不存在");
  }
  const chartPayload = chartPayloads[0];
  if (!chartPayload || !Array.isArray(chartPayload.chart)) {
    throw new Error("谱面数据格式无效");
  }

  const excludedCardIds = new Set(request.cards.excludedCardIds);
  const profileCards = getGameProfileCards(request.profilePayload).map((card) => {
    const effectiveCard = applyOwnedCardParameterPreferences(
      card,
      cardsPayload.payload[String(card.cardId)],
      request.cards.ownedCardParameters,
    );
    return {
      ...effectiveCard,
      cardInstanceKey: `profile:${card.cardId}`,
      isExcluded: effectiveCard.isExcluded || excludedCardIds.has(card.cardId),
    };
  });
  const temporaryCards = request.cards.temporaryCards.map((card, index) => ({
    ...card,
    cardInstanceKey: card.cardInstanceKey ?? `temporary:${card.instanceId ?? `${index}:${card.cardId}`}`,
    isExcluded: false,
  }));
  const userCards = [...profileCards, ...temporaryCards];
  const userAreaItems = getGameProfileAreaItems(request.profilePayload).flatMap((item) => (
    item.areaItemId === null ? [] : {
      areaItemId: item.areaItemId,
      level: item.level,
    }
  ));
  const eventBonus = mergeEventBonus(eventBonuses[0] ?? null, request.event.bonusOverride);

  if (request.event.eventType === "medley") {
    if (medleySongs.length !== 3) {
      throw new Error("巡回演出需要选择 3 首歌曲");
    }
    const medleySongInputs = medleySongs.map((medleySong, index) => {
      const medleySongId = Math.trunc(medleySong.songId);
      const medleySongMaster = songsPayload.payload[String(medleySongId)];
      const medleyChartPayload = chartPayloads[index];
      if (!medleySongMaster) {
        throw new Error(`第 ${index + 1} 首歌曲数据不存在`);
      }
      if (!medleyChartPayload || !Array.isArray(medleyChartPayload.chart)) {
        throw new Error(`第 ${index + 1} 首谱面数据格式无效`);
      }
      return {
        chart: medleyChartPayload.chart,
        chartCacheKey: `${medleySongId}:${medleySong.difficulty}:medley:${index}`,
        song: medleySongMaster,
        difficulty: medleySong.difficulty,
      };
    });
    const characterBonuses = buildBandoriCharacterBonuses(
      getGameProfileCharacterPotentials(request.profilePayload),
      getGameProfileCharacterMissionBonuses(request.profilePayload),
    );

    if (request.calculation.medleyMode === "legacy-greedy-single") {
      const startedAt = performance.now();
      const deadlineAt = startedAt + Math.min(300000, Math.max(1000, request.calculation.maxSearchDurationMs));
      const server = request.profilePayload.bestdoriProfile.server;
      const medleyInput = buildLegacyGreedyMedleyInput({
        userCards,
        userAreaItems,
        characterBonuses,
        cardsById: cardsPayload.payload,
        charactersById: charactersPayload.payload,
        skillsById: skillsPayload.payload,
        areaItemsById: areaItemsPayload.payload,
        songs: medleySongInputs,
        eventBonus,
        eventFormula: request.event.formula,
        perfectRate: request.song.perfectRate,
        server,
      });
      return buildSharedConfigurationLegacyGreedyMedleyResponse({
        input: medleyInput,
        songInputs: medleySongInputs,
        server,
        perfectRate: request.song.perfectRate,
        resultLimit: request.calculation.resultLimit,
        startedAt,
        deadlineAt,
      });
    }

    return searchBandoriBestMedleyTeams({
      userCards,
      userAreaItems,
      characterBonuses,
      cardsById: cardsPayload.payload,
      charactersById: charactersPayload.payload,
      skillsById: skillsPayload.payload,
      areaItemsById: areaItemsPayload.payload,
      songs: medleySongInputs,
      eventBonus,
      eventType: "medley",
      eventFormula: request.event.formula,
      target: "score",
      resultLimit: request.calculation.resultLimit,
      perfectRate: request.song.perfectRate,
      useSpecialRoomBonus: false,
      server: request.profilePayload.bestdoriProfile.server,
      maxSearchDurationMs: Math.min(300000, Math.max(1000, request.calculation.maxSearchDurationMs)),
      coarseAreaItemFilter: { mode: "all" },
      optimization: {
        debugConfigurationTrace: true,
        memorySoftLimitMiB: MEDLEY_FRONTEND_MEMORY_SOFT_LIMIT_MIB,
      },
      progress: options.onMedleyProgress
        ? {
          initialDelayMs: 10_000,
          scoreUpdateMinIntervalMs: 5_000,
          onProgress: options.onMedleyProgress,
        }
        : undefined,
    });
  }

  return searchBandoriBestTeams({
    userCards,
    userAreaItems,
    characterBonuses: buildBandoriCharacterBonuses(
      getGameProfileCharacterPotentials(request.profilePayload),
      getGameProfileCharacterMissionBonuses(request.profilePayload),
    ),
    cardsById: cardsPayload.payload,
    charactersById: charactersPayload.payload,
    skillsById: skillsPayload.payload,
    areaItemsById: areaItemsPayload.payload,
    chart: chartPayload.chart,
    chartCacheKey: `${songId}:${request.song.difficulty}:${request.live.type}:${request.event.eventType}`,
    song,
    difficulty: request.song.difficulty,
    eventBonus,
    eventType: request.event.eventType,
    eventFormula: request.event.formula,
    liveType: request.live.type,
    target: request.calculation.target,
    resultLimit: request.calculation.resultLimit,
    perfectRate: request.song.perfectRate,
    useSpecialRoomBonus: request.live.useSpecialRoomBonus,
    roomPower: request.live.roomPower,
    otherPlayersAveragePower: request.live.otherPlayersAveragePower,
    otherPlayerSkills: request.live.otherPlayerSkills,
    encoreSkillSource: request.live.encoreSkillSource,
    liveBoostCount: request.live.liveBoostCount,
    challengeCpCost: request.live.challengeCpCost,
    server: request.profilePayload.bestdoriProfile.server,
    maxSearchDurationMs: request.calculation.maxSearchDurationMs,
    constraints: request.calculation.constraints,
  });
}

self.onmessage = (event: MessageEvent<TeamSearchWorkerMessage>) => {
  if (event.data.type === "preload") {
    void preloadSearchData(event.data)
      .then(() => {
        self.postMessage({ requestId: event.data.requestId, type: "preload", ok: true } satisfies TeamSearchWorkerResponse);
      })
      .catch((error) => {
        self.postMessage({
          requestId: event.data.requestId,
          type: "preload",
          ok: false,
          error: error instanceof Error ? error.message : "准备数据失败",
        } satisfies TeamSearchWorkerResponse);
      });
    return;
  }

  const shouldReportMedleyProgress = Boolean(
    event.data.songs?.length === 3 && event.data.calculation.medleyMode !== "legacy-greedy-single",
  );
  void runSearch(event.data, {
    onMedleyProgress: shouldReportMedleyProgress
      ? (result) => {
        self.postMessage({
          requestId: event.data.requestId,
          type: "search-progress",
          ok: true,
          partial: true,
          result,
        } satisfies TeamSearchWorkerResponse);
      }
      : undefined,
  })
    .then((result) => {
      self.postMessage({ requestId: event.data.requestId, type: "search", ok: true, result } satisfies TeamSearchWorkerResponse);
    })
    .catch((error) => {
      self.postMessage({
        requestId: event.data.requestId,
        type: "search",
        ok: false,
        error: error instanceof Error ? error.message : "计算失败",
      } satisfies TeamSearchWorkerResponse);
    });
};

export {};
