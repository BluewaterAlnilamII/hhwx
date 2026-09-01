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
import { resolveBandoriCardMapForServerWithJpFallback } from "@/lib/bandori/cards/regional-extensions";
import { hasTrainedCardArt } from "@/lib/bandori/cards/training";
import {
  assertTeamSearchMasterReferences,
  assertTeamSearchRequestReferences,
  createAtomicTimedCache,
  createTimedLruCache,
  TEAM_SEARCH_CHART_CACHE_FRESH_TIME_MS,
  TEAM_SEARCH_CHART_CACHE_MAX_ENTRIES,
  TEAM_SEARCH_MASTER_CACHE_FRESH_TIME_MS,
  TeamSearchDataIntegrityError,
  type TimedCacheSnapshot,
} from "./team-search-data-cache";

// This entry file owns the immutable Worker asset URL. Bump the revision when imported
// search semantics change, and isolate all in-memory search caches under the same revision.
const TEAM_SEARCH_WORKER_ALGORITHM_REVISION = "regional-skill-fallback-v1";

type MasterResponse<T> = {
  payload: T;
};

type CardsResponse = Record<string, BestdoriCardMaster | undefined>;
type CachedCardsResponse = CardsResponse | MasterResponse<CardsResponse>;

type CardPreferenceRarityThreshold = 3 | 4 | 5;

type OwnedCardParameterPreferences = {
  maxLevelEpisodeTraining: boolean;
  maxMasterRank: boolean;
  maxMasterRankRarityThreshold: CardPreferenceRarityThreshold;
  maxSkillLevel: boolean;
  maxSkillLevelRarityThreshold: CardPreferenceRarityThreshold;
};

export type TeamSearchWorkerMessages = {
  notReady: string;
  requestFailed: string;
  invalidResponse: string;
  chartData: string;
  cardData: string;
  characterData: string;
  skillData: string;
  areaItemData: string;
  songData: string;
  eventBonus: string;
  songDataMissing: string;
  chartDataInvalid: string;
  selectMedleySongs: string;
  medleySongDataMissing: string;
  medleyChartDataInvalid: string;
  dataInconsistent: string;
  preloadFailed: string;
  calculateFailed: string;
};

const DEFAULT_WORKER_MESSAGES: TeamSearchWorkerMessages = {
  notReady: "{label} is not ready yet",
  requestFailed: "Request failed (HTTP {status})",
  invalidResponse: "API response format is invalid",
  chartData: "Chart data",
  cardData: "Card data",
  characterData: "Character data",
  skillData: "Skill data",
  areaItemData: "Area item data",
  songData: "Song data",
  eventBonus: "Event bonus",
  songDataMissing: "Song data does not exist",
  chartDataInvalid: "Chart data format is invalid",
  selectMedleySongs: "Medley live requires selecting 3 songs",
  medleySongDataMissing: "Song {index} data does not exist",
  medleyChartDataInvalid: "Song {index} chart data format is invalid",
  dataInconsistent: "Calculation data is incomplete after refresh: {details}",
  preloadFailed: "Failed to prepare data",
  calculateFailed: "Calculation failed",
};

const MEDLEY_FRONTEND_MEMORY_SOFT_LIMIT_MIB = 2800;
type MedleyCalculationMode = "maximize" | "legacy-greedy-single";

type TeamSearchWorkerMessageEnvelope = {
  messages?: TeamSearchWorkerMessages;
};

type TeamSearchWorkerSearchRequest = TeamSearchWorkerMessageEnvelope & {
  type: "search";
  requestId: string;
  profilePayload: UserGameProfilePayload;
  event: {
    eventType: BandoriTeamSearchEventType;
    formula: 0 | 1 | 2;
    baseBonus?: BandoriEventBonus | null;
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

export type TeamSearchWorkerPreloadRequest = TeamSearchWorkerMessageEnvelope & {
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

type TeamSearchMasterData = {
  cardsById: CardsResponse;
  charactersById: Record<string, { bandId?: number | null } | undefined>;
  skillsById: Record<string, BestdoriSkillMaster | undefined>;
  areaItemsById: Record<string, BestdoriAreaItemMaster | undefined>;
  songsById: Record<string, BestdoriSongMaster | undefined>;
};

const masterDataCache = createAtomicTimedCache<TeamSearchMasterData>({
  freshTimeMs: TEAM_SEARCH_MASTER_CACHE_FRESH_TIME_MS,
});
const chartDataCache = createTimedLruCache<{ chart: BestdoriChartEntity[] }>({
  freshTimeMs: TEAM_SEARCH_CHART_CACHE_FRESH_TIME_MS,
  maxEntries: TEAM_SEARCH_CHART_CACHE_MAX_ENTRIES,
});
const resolvedCardsBySource = new WeakMap<CardsResponse, Map<number, CardsResponse>>();

function formatWorkerMessage(template: string, values: Record<string, string | number> = {}): string {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function getWorkerMessages(messages?: TeamSearchWorkerMessages): TeamSearchWorkerMessages {
  return messages ?? DEFAULT_WORKER_MESSAGES;
}

async function requestJsonUncached<T>(
  path: string,
  messages: TeamSearchWorkerMessages,
  requestCache: RequestCache,
): Promise<T> {
  const response = await fetch(path, {
    cache: requestCache,
    headers: { "Content-Type": "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload) || formatWorkerMessage(messages.requestFailed, { status: response.status }));
  }

  const data = parseApiSuccessData<T>(payload);
  if (data === null) {
    throw new Error(messages.invalidResponse);
  }
  return data;
}

async function loadMasterData(
  messages: TeamSearchWorkerMessages,
  requestCache: RequestCache,
): Promise<TeamSearchMasterData> {
  const [cachedCards, charactersPayload, skillsPayload, areaItemsPayload, songsById] = await Promise.all([
    requestJsonUncached<CachedCardsResponse>("/api/bandori/master/cards", messages, requestCache),
    requestJsonUncached<MasterResponse<Record<string, { bandId?: number | null } | undefined>>>(
      "/api/bandori/master/characters/main",
      messages,
      requestCache,
    ),
    requestJsonUncached<MasterResponse<Record<string, BestdoriSkillMaster | undefined>>>(
      "/api/bandori/master/skills",
      messages,
      requestCache,
    ),
    requestJsonUncached<MasterResponse<Record<string, BestdoriAreaItemMaster | undefined>>>(
      "/api/bandori/master/areaItems",
      messages,
      requestCache,
    ),
    requestJsonUncached<Record<string, BestdoriSongMaster | undefined>>(
      "/api/bandori/master/music",
      messages,
      requestCache,
    ),
  ]);
  const value: TeamSearchMasterData = {
    cardsById: normalizeCachedCardsResponse(cachedCards),
    charactersById: charactersPayload.payload,
    skillsById: skillsPayload.payload,
    areaItemsById: areaItemsPayload.payload,
    songsById,
  };
  assertTeamSearchMasterReferences(value);
  return value;
}

function getMasterData(
  messages: TeamSearchWorkerMessages,
  forceRefresh = false,
): Promise<TimedCacheSnapshot<TeamSearchMasterData>> {
  return masterDataCache.get(
    (requestCache) => loadMasterData(messages, requestCache),
    { forceRefresh },
  );
}

function getChartData(
  path: string,
  messages: TeamSearchWorkerMessages,
  forceRefresh = false,
): Promise<TimedCacheSnapshot<{ chart: BestdoriChartEntity[] }>> {
  return chartDataCache.get(
    path,
    (requestCache) => requestJsonUncached(path, messages, requestCache),
    { forceRefresh },
  );
}

function normalizeCachedCardsResponse(response: CachedCardsResponse): CardsResponse {
  // During rollout, a shared HTTP cache may still hold the former
  // { data: { payload: cards } } response for this unchanged URL.
  const legacyPayload = (response as Partial<MasterResponse<CardsResponse>>).payload;
  return legacyPayload && typeof legacyPayload === "object"
    ? legacyPayload
    : response as CardsResponse;
}

function getCalculationCardsForProfileServer(cards: CardsResponse, server: number): CardsResponse {
  let resolvedByServer = resolvedCardsBySource.get(cards);
  if (!resolvedByServer) {
    resolvedByServer = new Map<number, CardsResponse>();
    resolvedCardsBySource.set(cards, resolvedByServer);
  }
  const cached = resolvedByServer.get(server);
  if (cached) {
    return cached;
  }
  const resolved = resolveBandoriCardMapForServerWithJpFallback(cards, server);
  resolvedByServer.set(server, resolved);
  return resolved;
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

function getEventBonusCardIds(eventBonus: BandoriEventBonus | null): number[] {
  return (eventBonus?.members ?? []).flatMap((member) => {
    if (typeof member !== "object" || member === null || Array.isArray(member)) {
      return [];
    }
    const record = member as Record<string, unknown>;
    const cardId = readPositiveInteger(record.situationId ?? record.id);
    return cardId > 0 ? [cardId] : [];
  });
}

async function withIntegrityRefreshRetry<T>(
  operation: (forceRefresh: boolean) => Promise<T>,
  messages: TeamSearchWorkerMessages,
): Promise<T> {
  try {
    return await operation(false);
  } catch (error) {
    if (!(error instanceof TeamSearchDataIntegrityError)) {
      throw error;
    }
  }

  try {
    return await operation(true);
  } catch (error) {
    if (!(error instanceof TeamSearchDataIntegrityError)) {
      throw error;
    }
    throw new Error(formatWorkerMessage(messages.dataInconsistent, {
      details: error.issues.join(", "),
    }));
  }
}

function getMasterCardRarity(card: BestdoriCardMaster | undefined): number {
  return readPositiveInteger(card?.rarity, 0);
}

function getMasterCardMaxLevel(card: BestdoriCardMaster | undefined): number {
  if (!card) {
    return 0;
  }
  const baseLevelLimit = Math.max(1, readPositiveInteger(card.levelLimit, 1));
  const trainingLevelLimit = hasTrainedCardArt(card)
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
  const hasTraining = hasTrainedCardArt(masterCard);
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
  const messages = getWorkerMessages(request.messages);
  await withIntegrityRefreshRetry(async (forceRefresh) => {
    const songs = [
      ...(request.song ? [request.song] : []),
      ...(request.songs ?? []),
    ].map((song) => ({
      songId: Math.trunc(song.songId),
      difficulty: song.difficulty,
    }));
    const [masterSnapshot, chartSnapshots] = await Promise.all([
      getMasterData(messages, forceRefresh),
      Promise.all(songs.map((song) => getChartData(
        `/api/bandori/charts/${song.songId}/${song.difficulty}`,
        messages,
        forceRefresh,
      ))),
    ]);
    assertTeamSearchRequestReferences({
      cardIds: [],
      eventCardIds: [],
      areaItemIds: [],
      externalSkillIds: [],
      songIds: songs.map((song) => song.songId),
      cardsById: masterSnapshot.value.cardsById,
      areaItemsById: masterSnapshot.value.areaItemsById,
      skillsById: masterSnapshot.value.skillsById,
      songsById: masterSnapshot.value.songsById,
    });
    const invalidChartIndex = chartSnapshots.findIndex((snapshot) => !Array.isArray(snapshot.value.chart));
    if (invalidChartIndex >= 0) {
      const song = songs[invalidChartIndex];
      throw new TeamSearchDataIntegrityError([
        `chart ${song.songId}:${song.difficulty}`,
      ]);
    }
  }, messages);
}

async function runSearchAttempt(
  request: TeamSearchWorkerSearchRequest,
  options: TeamSearchWorkerRunOptions = {},
  forceRefresh = false,
): Promise<BandoriTeamSearchResponse | BandoriMedleyTeamSearchResponse> {
  const messages = getWorkerMessages(request.messages);
  const songId = Math.trunc(request.song.songId);
  const medleySongs = request.event.eventType === "medley" ? request.songs?.slice(0, 3) ?? [] : [];
  const chartRequests = medleySongs.length > 0
    ? medleySongs.map((song) => (
      getChartData(
        `/api/bandori/charts/${Math.trunc(song.songId)}/${song.difficulty}`,
        messages,
        forceRefresh,
      )
    ))
    : [
      getChartData(
        `/api/bandori/charts/${songId}/${request.song.difficulty}`,
        messages,
        forceRefresh,
      ),
    ];
  const [masterSnapshot, chartSnapshots] = await Promise.all([
    getMasterData(messages, forceRefresh),
    Promise.all(chartRequests),
  ]);
  const {
    cardsById: cachedCards,
    charactersById,
    skillsById,
    areaItemsById,
    songsById,
  } = masterSnapshot.value;
  const server = request.profilePayload.bestdoriProfile.server;
  const cardsById = getCalculationCardsForProfileServer(
    cachedCards,
    server,
  );

  const song = songsById[String(songId)];
  if (!song) {
    throw new TeamSearchDataIntegrityError([`song ${songId}`]);
  }
  const chartSnapshot = chartSnapshots[0];
  if (!chartSnapshot || !Array.isArray(chartSnapshot.value.chart)) {
    throw new TeamSearchDataIntegrityError([
      `chart ${songId}:${request.song.difficulty}`,
    ]);
  }

  const excludedCardIds = new Set(request.cards.excludedCardIds);
  const temporaryCardIds = new Set(request.cards.temporaryCards.map((card) => card.cardId));
  const profileCards = getGameProfileCards(request.profilePayload)
    .filter((card) => !temporaryCardIds.has(card.cardId))
    .map((card) => {
      const effectiveCard = applyOwnedCardParameterPreferences(
        card,
        cardsById[String(card.cardId)],
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
  const eventBonus = mergeEventBonus(request.event.baseBonus ?? null, request.event.bonusOverride);
  assertTeamSearchRequestReferences({
    cardIds: userCards.filter((card) => !card.isExcluded).map((card) => card.cardId),
    eventCardIds: getEventBonusCardIds(eventBonus),
    areaItemIds: userAreaItems.map((item) => item.areaItemId),
    externalSkillIds: (request.live.otherPlayerSkills ?? []).map((skill) => skill.skillId),
    songIds: medleySongs.length > 0
      ? medleySongs.map((medleySong) => Math.trunc(medleySong.songId))
      : [songId],
    cardsById,
    areaItemsById,
    skillsById,
    songsById,
  });

  if (request.event.eventType === "medley") {
    if (medleySongs.length !== 3) {
      throw new Error(messages.selectMedleySongs);
    }
    const medleySongInputs = medleySongs.map((medleySong, index) => {
      const medleySongId = Math.trunc(medleySong.songId);
      const medleySongMaster = songsById[String(medleySongId)];
      const medleyChartSnapshot = chartSnapshots[index];
      if (!medleySongMaster) {
        throw new TeamSearchDataIntegrityError([`song ${medleySongId}`]);
      }
      if (!medleyChartSnapshot || !Array.isArray(medleyChartSnapshot.value.chart)) {
        throw new TeamSearchDataIntegrityError([
          `chart ${medleySongId}:${medleySong.difficulty}`,
        ]);
      }
      return {
        chart: medleyChartSnapshot.value.chart,
        chartCacheKey: [
          TEAM_SEARCH_WORKER_ALGORITHM_REVISION,
          `master-${masterSnapshot.generation}`,
          `chart-${medleyChartSnapshot.generation}`,
          medleySongId,
          medleySong.difficulty,
          "medley",
          index,
        ].join(":"),
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
      const medleyInput = buildLegacyGreedyMedleyInput({
        userCards,
        userAreaItems,
        characterBonuses,
        cardsById,
        charactersById,
        skillsById,
        areaItemsById,
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
      cardsById,
      charactersById,
      skillsById,
      areaItemsById,
      songs: medleySongInputs,
      eventBonus,
      eventType: "medley",
      eventFormula: request.event.formula,
      target: "score",
      resultLimit: request.calculation.resultLimit,
      perfectRate: request.song.perfectRate,
      useSpecialRoomBonus: false,
      server,
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
    cardsById,
    charactersById,
    skillsById,
    areaItemsById,
    chart: chartSnapshot.value.chart,
    chartCacheKey: [
      TEAM_SEARCH_WORKER_ALGORITHM_REVISION,
      `master-${masterSnapshot.generation}`,
      `chart-${chartSnapshot.generation}`,
      songId,
      request.song.difficulty,
      request.live.type,
      request.event.eventType,
    ].join(":"),
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
    server,
    maxSearchDurationMs: request.calculation.maxSearchDurationMs,
    constraints: request.calculation.constraints,
  });
}

function runSearch(
  request: TeamSearchWorkerSearchRequest,
  options: TeamSearchWorkerRunOptions = {},
): Promise<BandoriTeamSearchResponse | BandoriMedleyTeamSearchResponse> {
  const messages = getWorkerMessages(request.messages);
  return withIntegrityRefreshRetry(
    (forceRefresh) => runSearchAttempt(request, options, forceRefresh),
    messages,
  );
}

self.onmessage = (event: MessageEvent<TeamSearchWorkerMessage>) => {
  const messages = getWorkerMessages(event.data.messages);
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
          error: error instanceof Error ? error.message : messages.preloadFailed,
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
        error: error instanceof Error ? error.message : messages.calculateFailed,
      } satisfies TeamSearchWorkerResponse);
    });
};

export {};
