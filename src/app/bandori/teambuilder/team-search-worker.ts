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
    flameCount?: 0 | 1 | 2 | 3;
    challengeCpCost?: 200 | 400 | 800 | 1600;
  };
  song: {
    songId: number;
    difficulty: BandoriTeamSearchDifficulty;
    perfectRate: number;
  };
  cards: {
    excludedCardIds: number[];
  };
  calculation: {
    target: BandoriTeamSearchTarget;
    resultLimit: number;
    maxSearchDurationMs: number;
  };
};

export type TeamSearchWorkerPreloadRequest = {
  type: "preload";
  requestId: string;
  song?: {
    songId: number;
    difficulty: BandoriTeamSearchDifficulty;
  };
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
      result: BandoriTeamSearchResponse;
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

  if (request.event?.eventId) {
    preloadRequests.push(requestJson<EventBonusResponse>(`/api/bandori/events/bonuses?event=${request.event.eventId}`));
  }

  await Promise.all(preloadRequests);
}

async function runSearch(request: TeamSearchWorkerSearchRequest): Promise<BandoriTeamSearchResponse> {
  const songId = Math.trunc(request.song.songId);
  const [cardsPayload, charactersPayload, skillsPayload, areaItemsPayload, songsPayload, chartPayload, eventBonuses] = await Promise.all([
    requireCachedJson<MasterResponse<Record<string, BestdoriCardMaster | undefined>>>("/api/bandori/master/cards", "卡牌数据"),
    requireCachedJson<MasterResponse<Record<string, { bandId?: number | null } | undefined>>>("/api/bandori/master/characters", "角色数据"),
    requireCachedJson<MasterResponse<Record<string, BestdoriSkillMaster | undefined>>>("/api/bandori/master/skills", "技能数据"),
    requireCachedJson<MasterResponse<Record<string, BestdoriAreaItemMaster | undefined>>>("/api/bandori/master/areaItems", "区域道具数据"),
    requireCachedJson<MasterResponse<Record<string, BestdoriSongMaster | undefined>>>("/api/bandori/master/songs", "歌曲数据"),
    requireCachedJson<{ chart: BestdoriChartEntity[] }>(`/api/bandori/charts/${songId}/${request.song.difficulty}`, "谱面数据"),
    request.event.eventId
      ? requireCachedJson<EventBonusResponse>(`/api/bandori/events/bonuses?event=${request.event.eventId}`, "活动加成").then((response) => response.bonuses)
      : Promise.resolve([]),
  ]);

  const song = songsPayload.payload[String(songId)];
  if (!song) {
    throw new Error("歌曲数据不存在");
  }
  if (!Array.isArray(chartPayload.chart)) {
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
    flameCount: request.live.flameCount,
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
