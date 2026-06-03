import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import {
  searchBandoriBestTeams,
  type BandoriTeamSearchDifficulty,
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
import { buildMedleyResult, pushMedleyResult, sortMedleyResults } from "@/lib/bandori/team-builder/medley/results";
import {
  buildFastGreedyMedleySlotCandidate,
  getMedleyGreedySeedSlotIndices,
} from "@/lib/bandori/team-builder/medley/seeds";
import {
  buildMedleySlotBuildContexts,
  buildMedleySlotSearches,
  createMedleySlotInput,
  pruneDominatedMedleySlotCards,
} from "@/lib/bandori/team-builder/medley/slots";
import { createInitialMedleyProfilingStats } from "@/lib/bandori/team-builder/medley/profiling";
import type { MedleyTeamCandidate } from "@/lib/bandori/team-builder/medley/types";
import {
  type BandoriCharacterBonusState,
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
  type UserGameProfilePayload,
} from "@/lib/user-game-profile-payload";

type MasterResponse<T> = {
  payload: T;
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
  };
  calculation: {
    target: BandoriTeamSearchTarget;
    resultLimit: number;
    maxSearchDurationMs: number;
    medleyMode?: MedleyCalculationMode;
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
      type: "preload" | "search";
      ok: false;
      error: string;
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

function buildCharacterBonuses(
  potentials: ReturnType<typeof getGameProfileCharacterPotentials>,
  missionBonuses: ReturnType<typeof getGameProfileCharacterMissionBonuses>,
): BandoriCharacterBonusState[] {
  const records = new Map<number, BandoriCharacterBonusState>();
  const usesDetailedCharacterBonuses = potentials.some((potential) => (
    potential.performanceLevel !== potential.techniqueLevel
    || potential.performanceLevel !== potential.visualLevel
  )) || missionBonuses.some((bonus) => (
    bonus.performance !== bonus.technique
    || bonus.performance !== bonus.visual
  ));

  potentials.forEach((potential) => {
    const record = records.get(potential.characterId) ?? { characterId: potential.characterId };
    record.potential = {
      performance: potential.performanceLevel,
      technique: potential.techniqueLevel,
      visual: potential.visualLevel,
    };
    records.set(potential.characterId, record);
  });

  missionBonuses.forEach((bonus) => {
    const record = records.get(bonus.characterId) ?? { characterId: bonus.characterId };
    const current = record.missionBonusPercent ?? {};
    const bonusType = bonus.bonusType.toUpperCase() === "TRAINING" ? "training" : "collection";
    const currentByType = record.missionBonusPercentByType ?? {};
    record.missionBonusPercent = {
      performance: (current.performance ?? 0) + bonus.performance / 10,
      technique: (current.technique ?? 0) + bonus.technique / 10,
      visual: (current.visual ?? 0) + bonus.visual / 10,
    };
    record.missionBonusPercentByType = {
      ...currentByType,
      [bonusType]: {
        performance: bonus.performance / 10,
        technique: bonus.technique / 10,
        visual: bonus.visual / 10,
      },
    };
    record.missionBonusRoundingMode = usesDetailedCharacterBonuses ? "combined" : "split-by-type";
    records.set(bonus.characterId, record);
  });

  return [...records.values()];
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

function buildMedleyGreedySlotOrders(slotCount: number, preferredOrder: number[]): number[][] {
  const orders: number[][] = [];
  const pushUniqueOrder = (order: number[]): void => {
    const key = order.join(",");
    if (order.length === slotCount && !orders.some((existing) => existing.join(",") === key)) {
      orders.push(order);
    }
  };

  pushUniqueOrder(preferredOrder);
  if (slotCount === 3) {
    pushUniqueOrder([2, 1, 0]);
    pushUniqueOrder([2, 0, 1]);
    pushUniqueOrder([1, 2, 0]);
    pushUniqueOrder([1, 0, 2]);
    pushUniqueOrder([0, 2, 1]);
    pushUniqueOrder([0, 1, 2]);
  } else {
    pushUniqueOrder(Array.from({ length: slotCount }, (_, index) => slotCount - index - 1));
    pushUniqueOrder(Array.from({ length: slotCount }, (_, index) => index));
  }
  return orders;
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
  const buildContexts = buildMedleySlotBuildContexts(input, songInputs, calculatedCards, server);
  const isPastDeadline = (): boolean => {
    const timedOut = performance.now() >= deadlineAt;
    if (timedOut) {
      stats.timedOut = true;
    }
    return timedOut;
  };

  for (const configuration of configurations) {
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
    const seedOrders = buildMedleyGreedySlotOrders(slots.length, getMedleyGreedySeedSlotIndices(slots));
    let completedConfiguration = false;

    for (const seedOrder of seedOrders) {
      const selectedBySong: Array<MedleyTeamCandidate | undefined> = [];
      const bannedCardIds = new Set<number>();
      let completedSeedOrder = true;

      for (const slotIndex of seedOrder) {
        if (isPastDeadline()) {
          completedSeedOrder = false;
          break;
        }
        const slot = slots[slotIndex];
        const candidate = buildFastGreedyMedleySlotCandidate(
          slot,
          bannedCardIds,
          server,
          perfectRate,
          stats,
          profiling,
        );
        if (!candidate) {
          completedSeedOrder = false;
          break;
        }
        selectedBySong[slot.songIndex] = candidate;
        for (const cardId of candidate.cardIds) {
          bannedCardIds.add(cardId);
        }
      }

      const result = completedSeedOrder
        ? buildMedleyResult(slots, selectedBySong, configuration)
        : null;
      if (result) {
        completedConfiguration = true;
        pushMedleyResult(results, result, resultLimit);
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

  return {
    results,
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
    requestJson<MasterResponse<Record<string, { bandId?: number | null } | undefined>>>("/api/bandori/master/characters"),
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

async function runSearch(request: TeamSearchWorkerSearchRequest): Promise<BandoriTeamSearchResponse | BandoriMedleyTeamSearchResponse> {
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
    requireCachedJson<MasterResponse<Record<string, { bandId?: number | null } | undefined>>>("/api/bandori/master/characters", "角色数据"),
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
  const userCards = getGameProfileCards(request.profilePayload).map((card) => ({
    ...card,
    isExcluded: card.isExcluded || excludedCardIds.has(card.cardId),
  }));
  const userAreaItems = getGameProfileAreaItems(request.profilePayload).flatMap((item) => (
    item.areaItemId === null ? [] : {
      areaItemId: item.areaItemId,
      level: item.level,
    }
  ));
  const eventBonus = mergeEventBonus(eventBonuses[0] ?? null, request.event.bonusOverride);

  if (request.event.eventType === "medley") {
    if (medleySongs.length !== 3) {
      throw new Error("组曲LIVE需要选择 3 首歌曲");
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
    const characterBonuses = buildCharacterBonuses(
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
        });
  }

  return searchBandoriBestTeams({
    userCards,
    userAreaItems,
    characterBonuses: buildCharacterBonuses(
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

  void runSearch(event.data)
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
