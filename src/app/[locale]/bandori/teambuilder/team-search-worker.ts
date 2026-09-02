import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import {
  searchBandoriBestTeams,
  type BandoriTeamSearchDifficulty,
  type BandoriTeamSearchConstraints,
  type BandoriTeamSearchEventType,
  type BandoriTeamSearchExternalSkill,
  type BandoriTeamSearchLiveType,
  type BandoriTeamSearchResult,
  type BandoriTeamSearchResponse,
  type BandoriTeamSearchTarget,
  type BestdoriChartEntity,
  type BestdoriSongMaster,
} from "@/lib/bandori-team-search";
import { buildBandoriCharacterBonuses } from "@/lib/bandori-character-bonuses";
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
  replaceGameProfileCards,
  type UserGameProfileCardRecord,
  type UserGameProfilePayload,
} from "@/lib/user-game-profile-payload";
import { BANDORI_AREA_ITEM_IDS_BY_GROUP } from "@/lib/bandori-area-item-groups";
import {
  ATTRIBUTE_AREA_ITEM_IDS,
  BAND_AREA_ITEM_GROUP_KEYS,
  PARAMETER_AREA_ITEM_IDS,
} from "@/lib/bandori/team-builder/core/constants";
import {
  buildMedleySearchInput,
  MedleyFoundationInputError,
  type MedleySearchInputV1,
} from "@/lib/bandori/medley-foundation";
import { MEDLEY_SEARCH_SOURCE_SCHEMA_VERSION } from "@/lib/bandori/medley-foundation/contracts";
import initMedleyWasm, { runMedleySearchJson } from "@/lib/bandori/medley-wasm/pkg/bandori_medley";
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
  profileDataInvalid: string;
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
  profileDataInvalid: "Profile data is invalid; try syncing or updating the profile",
};

const MEDLEY_FRONTEND_MEMORY_SOFT_LIMIT_MIB = 1024;
const MEDLEY_FRONTEND_MEMORY_BUDGET_BYTES = MEDLEY_FRONTEND_MEMORY_SOFT_LIMIT_MIB * 1024 * 1024;
const MEDLEY_FRONTEND_MAX_SEARCH_DURATION_MS = 3_600_000;
const MEDLEY_PROGRESS_INITIAL_DELAY_MS = 10_000;
const MEDLEY_PROGRESS_INTERVAL_MS = 5_000;
type MedleyCalculationMode = "maximize";

type WasmMedleySearchTeam = {
  slot: number;
  memberInstanceIds: [number, number, number, number, number];
  averageScore: number;
};

type WasmMedleySearchSolution = {
  selectedAreaItemIds: number[];
  teams: [WasmMedleySearchTeam, WasmMedleySearchTeam, WasmMedleySearchTeam];
  totalAverageScore: number;
};

type WasmHydratedMedleyTeam = WasmMedleySearchTeam & {
  parameters: {
    cardPower: number;
    areaItemPower: number;
    eventPower: number;
    deckTotalParameter: number;
  };
  minimumScore: number;
  maximumScore: number;
  bestSkillOrderMemberInstanceIds: [number, number, number, number, number, number];
  maximumScoreOrderCount: number;
  scoreOrderCount: number;
};

type WasmHydratedMedleySolution = {
  selectedAreaItemIds: number[];
  teams: [WasmHydratedMedleyTeam, WasmHydratedMedleyTeam, WasmHydratedMedleyTeam];
  totalMinimumScore: number;
  totalAverageScore: number;
  totalMaximumScore: number;
};

type WasmMedleySearchOutcome = {
  status: "exact";
  best: WasmMedleySearchSolution | null;
  discovered: WasmMedleySearchSolution[];
  diagnostics: Record<string, unknown>;
} | {
  status: "incomplete";
  reason: string;
  bestSoFar: WasmMedleySearchSolution | null;
  discovered: WasmMedleySearchSolution[];
  diagnostics: Record<string, unknown>;
};

type WasmMedleySearchRunResult = {
  outcome: WasmMedleySearchOutcome;
  hydration: {
    candidates: WasmHydratedMedleySolution[];
    maximumScoreCandidateIndex: number | null;
  };
};

export type BandoriMedleyFrontendProgressDto = {
  kind: "medley";
  elapsedMs: number;
  timeToBestScoreMs: number;
  bestSoFar: {
    totalAverageScore: number;
    selectedAreaItemIds: number[];
    teams: Array<{
      slot: number;
      cardIds: number[];
      leaderCardId: number;
      leaderCardInstanceKey?: string;
      averageScore: number;
      cards: BandoriTeamSearchResult["cards"];
    }>;
  };
};

export type BandoriMedleyFrontendCandidateDto = {
  rank: number;
  score: number;
  averageScore: number;
  maxScore: number;
  minScore: number;
  areaItemConfiguration: BandoriTeamSearchResult["areaItemConfiguration"];
  songResults: Array<BandoriTeamSearchResult & {
    songIndex: number;
    startCombo: number;
    notesCount: number;
  }>;
  cardIds: number[];
};

export type BandoriMedleyFrontendFinalDto = {
  kind: "medley";
  status: "exact" | "incomplete";
  incompleteReason: string | null;
  /** At most ten retained, hydrated candidates in average-score order. */
  candidates: BandoriMedleyFrontendCandidateDto[];
  maximumScoreCandidate: BandoriMedleyFrontendCandidateDto | null;
  stats: {
    elapsedMs: number;
    hydrationElapsedMs: number;
    timeToBestScoreMs: number | null;
    memoryBudgetBytes: number;
    diagnostics: Record<string, unknown>;
  };
};

type TeamSearchWorkerSearchResult = BandoriTeamSearchResponse | BandoriMedleyFrontendFinalDto;

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
    /** Raw frontend percentage text; required by the greenfield medley adapter. */
    perfectRatePercentText?: string;
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
      result: TeamSearchWorkerSearchResult;
    }
  | {
      requestId: string;
      type: "search-progress";
      ok: true;
      partial: true;
      result: null;
      progress: BandoriMedleyFrontendProgressDto;
    }
  | {
      requestId: string;
      type: "preload" | "search";
      ok: false;
      error: string;
    };

type TeamSearchWorkerRunOptions = {
  onMedleyProgress?: (progress: BandoriMedleyFrontendProgressDto) => void;
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

function formatSearchError(error: unknown, messages: TeamSearchWorkerMessages): string {
  const detail = error instanceof Error ? error.message : messages.calculateFailed;
  return error instanceof MedleyFoundationInputError
    && error.code === "INVALID_CARD"
    && error.path.startsWith("sourceInput.cardsById.")
    && error.path.includes(".profile.")
    ? `${messages.profileDataInvalid}\n${detail}`
    : detail;
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

type EffectiveProfileCard = UserGameProfileCardRecord & { cardInstanceKey?: string };

function describeAreaItemConfiguration(
  selectedAreaItemIds: number[],
): BandoriTeamSearchResult["areaItemConfiguration"] {
  const selected = new Set(selectedAreaItemIds);
  const bandKey = BAND_AREA_ITEM_GROUP_KEYS.find((key) => (
    (BANDORI_AREA_ITEM_IDS_BY_GROUP[key] ?? []).some((areaItemId) => selected.has(areaItemId))
  )) ?? null;
  const attribute = (Object.entries(ATTRIBUTE_AREA_ITEM_IDS) as Array<[
    BandoriTeamSearchResult["areaItemConfiguration"]["attribute"],
    number[],
  ]>).find(([, areaItemIds]) => areaItemIds.some((areaItemId) => selected.has(areaItemId)))?.[0] ?? null;
  const parameter = (Object.entries(PARAMETER_AREA_ITEM_IDS) as Array<[
    NonNullable<BandoriTeamSearchResult["areaItemConfiguration"]["parameter"]>,
    readonly number[],
  ]>).find(([, areaItemIds]) => areaItemIds.some((areaItemId) => selected.has(areaItemId)))?.[0] ?? null;
  return { bandKey, attribute, parameter, selectedAreaItemIds };
}

function mapMedleyDisplayCard(
  instanceId: number,
  input: MedleySearchInputV1,
  effectiveCards: EffectiveProfileCard[],
  cardsById: CardsResponse,
): BandoriTeamSearchResult["cards"][number] {
  const searchCard = input.cards[instanceId];
  const state = effectiveCards[instanceId];
  if (!searchCard || !state || searchCard.instanceId !== instanceId) {
    throw new Error(`Invalid medley result card instance ${instanceId}`);
  }
  const master = cardsById[String(searchCard.masterCardId)];
  return {
    cardId: searchCard.masterCardId,
    cardInstanceKey: state.cardInstanceKey,
    characterId: searchCard.characterId,
    bandId: searchCard.bandId,
    attribute: searchCard.attribute,
    rarity: readPositiveInteger(master?.rarity),
    skillId: readPositiveInteger(master?.skillId),
    skillLevel: state.skillLevel,
    level: state.level,
    masterRank: state.masterRank,
    isTrained: state.isTrained,
    totalPower: searchCard.characterParameter.reduce((sum, value) => sum + value, 0),
  };
}

function mapMedleyCandidate(
  candidate: WasmHydratedMedleySolution,
  rank: number,
  input: MedleySearchInputV1,
  effectiveCards: EffectiveProfileCard[],
  cardsById: CardsResponse,
): BandoriMedleyFrontendCandidateDto {
  const areaItemConfiguration = describeAreaItemConfiguration(candidate.selectedAreaItemIds);
  let startCombo = 0;
  const songResults = candidate.teams.map((team, songIndex) => {
    const cards = team.memberInstanceIds.map((instanceId) => (
      mapMedleyDisplayCard(instanceId, input, effectiveCards, cardsById)
    ));
    const cardByInstanceId = new Map(team.memberInstanceIds.map((instanceId, index) => [instanceId, cards[index]]));
    const leader = cardByInstanceId.get(team.memberInstanceIds[2]);
    if (!leader) {
      throw new Error(`Invalid medley result leader for slot ${songIndex}`);
    }
    const skillOrderCards = team.bestSkillOrderMemberInstanceIds.map((instanceId) => cardByInstanceId.get(instanceId));
    if (skillOrderCards.some((card) => !card)) {
      throw new Error(`Invalid medley result skill order for slot ${songIndex}`);
    }
    const notesCount = input.songs[songIndex]?.notes.length ?? 0;
    const result: BandoriMedleyFrontendCandidateDto["songResults"][number] = {
      rank: 1,
      score: team.averageScore,
      targetValue: team.averageScore,
      averageScore: team.averageScore,
      maxScore: team.maximumScore,
      minScore: team.minimumScore,
      maxScoreOrderCount: team.maximumScoreOrderCount,
      maxScoreOrderTotal: team.scoreOrderCount,
      totalPower: team.parameters.deckTotalParameter,
      rawCardPower: team.parameters.cardPower,
      areaItemPower: team.parameters.areaItemPower,
      eventPower: team.parameters.eventPower,
      eventPowerWithRoom: team.parameters.eventPower,
      pointBonusRate: 0,
      eventPointBase: null,
      eventPointMultiplier: 1,
      eventPoint: null,
      eventPointOptions: { mode: "none", defaultKey: null, options: [] },
      eventMode: "parameterPower",
      roomScore: null,
      supportBandPower: null,
      supportCards: [],
      liveType: "free",
      eventType: "medley",
      target: "score",
      leaderCardId: leader.cardId,
      leaderCardInstanceKey: leader.cardInstanceKey,
      skillOrderCardIds: skillOrderCards.map((card) => card?.cardId ?? 0),
      skillOrderCardInstanceKeys: skillOrderCards.map((card) => card?.cardInstanceKey ?? `profile:${card?.cardId ?? 0}`),
      areaItemConfiguration,
      context: {
        sameBandId: cards.every((card) => card.bandId === cards[0]?.bandId) ? cards[0]?.bandId ?? null : null,
        sameAttribute: cards.every((card) => card.attribute === cards[0]?.attribute) ? cards[0]?.attribute ?? null : null,
      },
      cards,
      skills: cards.map((card) => ({
        cardId: card.cardId,
        cardInstanceKey: card.cardInstanceKey,
        skillId: card.skillId,
        skillLevel: card.skillLevel,
        resolvedSkill: null,
      })),
      songIndex,
      startCombo,
      notesCount,
    };
    startCombo += notesCount;
    return result;
  });
  const cardIds = songResults.flatMap((songResult) => songResult.cards.map((card) => card.cardId));
  return {
    rank,
    score: candidate.totalAverageScore,
    averageScore: candidate.totalAverageScore,
    maxScore: candidate.totalMaximumScore,
    minScore: candidate.totalMinimumScore,
    areaItemConfiguration,
    songResults,
    cardIds,
  };
}

function mapMedleyProgress(
  solution: WasmMedleySearchSolution,
  input: MedleySearchInputV1,
  effectiveCards: EffectiveProfileCard[],
  cardsById: CardsResponse,
  elapsedMs: number,
  timeToBestScoreMs: number,
): BandoriMedleyFrontendProgressDto {
  return {
    kind: "medley",
    elapsedMs,
    timeToBestScoreMs,
    bestSoFar: {
      totalAverageScore: solution.totalAverageScore,
      selectedAreaItemIds: solution.selectedAreaItemIds,
      teams: solution.teams.map((team) => {
        const cards = team.memberInstanceIds.map((instanceId) => (
          mapMedleyDisplayCard(instanceId, input, effectiveCards, cardsById)
        ));
        const leader = cards[2];
        return {
          slot: team.slot,
          cardIds: cards.map((card) => card.cardId),
          leaderCardId: leader?.cardId ?? 0,
          leaderCardInstanceKey: leader?.cardInstanceKey,
          averageScore: team.averageScore,
          cards,
        };
      }),
    },
  };
}

async function runGreenfieldMedleySearch({
  request,
  input,
  effectiveCards,
  cardsById,
  options,
}: {
  request: TeamSearchWorkerSearchRequest;
  input: MedleySearchInputV1;
  effectiveCards: EffectiveProfileCard[];
  cardsById: CardsResponse;
  options: TeamSearchWorkerRunOptions;
}): Promise<BandoriMedleyFrontendFinalDto> {
  await initMedleyWasm();
  const inputJson = JSON.stringify(input);
  const searchStartedAt = performance.now();
  const requestedSearchDurationMs = request.calculation.maxSearchDurationMs;
  const searchDurationMs = Number.isFinite(requestedSearchDurationMs)
    ? Math.min(MEDLEY_FRONTEND_MAX_SEARCH_DURATION_MS, Math.max(1_000, requestedSearchDurationMs))
    : 1_000;
  const deadlineAt = searchStartedAt + searchDurationMs;
  let searchFinishedAt: number | null = null;
  let timeToBestScoreMs: number | null = null;
  let pendingProgress: WasmMedleySearchSolution | null = null;
  let lastProgressAt: number | null = null;

  const publishPendingProgress = (now: number): void => {
    if (!pendingProgress || !options.onMedleyProgress) {
      return;
    }
    const elapsedMs = now - searchStartedAt;
    if (elapsedMs < MEDLEY_PROGRESS_INITIAL_DELAY_MS
      || (lastProgressAt !== null && now - lastProgressAt < MEDLEY_PROGRESS_INTERVAL_MS)) {
      return;
    }
    options.onMedleyProgress(mapMedleyProgress(
      pendingProgress,
      input,
      effectiveCards,
      cardsById,
      elapsedMs,
      timeToBestScoreMs ?? elapsedMs,
    ));
    pendingProgress = null;
    lastProgressAt = now;
  };

  const resultJson = runMedleySearchJson(
    inputJson,
    MEDLEY_FRONTEND_MEMORY_BUDGET_BYTES,
    () => {
      const now = performance.now();
      publishPendingProgress(now);
      return now >= deadlineAt ? "timed_out" : undefined;
    },
    (solutionJson: string) => {
      const now = performance.now();
      timeToBestScoreMs = now - searchStartedAt;
      pendingProgress = JSON.parse(solutionJson) as WasmMedleySearchSolution;
      publishPendingProgress(now);
    },
    () => {
      searchFinishedAt = performance.now();
    },
  );
  const hydrationFinishedAt = performance.now();
  const runResult = JSON.parse(resultJson) as WasmMedleySearchRunResult;
  const candidates = runResult.hydration.candidates.map((candidate, index) => (
    mapMedleyCandidate(candidate, index + 1, input, effectiveCards, cardsById)
  ));
  const maximumScoreCandidateIndex = runResult.hydration.maximumScoreCandidateIndex;
  const maximumScoreCandidate = maximumScoreCandidateIndex === null
    ? null
    : candidates[maximumScoreCandidateIndex] ?? null;
  const diagnostics = runResult.outcome.diagnostics;
  const incompleteReason = runResult.outcome.status === "incomplete"
    ? runResult.outcome.reason
    : null;
  const finishedAt = searchFinishedAt ?? hydrationFinishedAt;

  return {
    kind: "medley",
    status: runResult.outcome.status,
    incompleteReason,
    candidates,
    maximumScoreCandidate,
    stats: {
      elapsedMs: finishedAt - searchStartedAt,
      hydrationElapsedMs: hydrationFinishedAt - finishedAt,
      timeToBestScoreMs,
      memoryBudgetBytes: MEDLEY_FRONTEND_MEMORY_BUDGET_BYTES,
      diagnostics,
    },
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
): Promise<TeamSearchWorkerSearchResult> {
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
    const perfectRatePercentText = request.song.perfectRatePercentText;
    if (typeof perfectRatePercentText !== "string") {
      throw new Error("Medley search requires the original PERFECT percentage text");
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
        songIdText: String(medleySongId),
        difficulty: medleySong.difficulty,
        chart: medleyChartSnapshot.value.chart,
      };
    });
    const profilePayload = replaceGameProfileCards(request.profilePayload, userCards.map((card) => ({
      cardId: card.cardId,
      level: card.level,
      masterRank: card.masterRank,
      skillLevel: card.skillLevel,
      episodeCount: card.episodeCount,
      isTrained: card.isTrained,
      hasTrainedArt: card.hasTrainedArt,
      isExcluded: card.isExcluded,
    })));
    const cardInstanceKeyById = new Map(userCards.map((card) => [card.cardId, card.cardInstanceKey]));
    const effectiveCards = getGameProfileCards(profilePayload).map((card) => ({
      ...card,
      cardInstanceKey: cardInstanceKeyById.get(card.cardId),
    }));
    const medleyInput = buildMedleySearchInput({
      schemaVersion: MEDLEY_SEARCH_SOURCE_SCHEMA_VERSION,
      profilePayload,
      cardsById: cachedCards,
      charactersById,
      skillsById,
      areaItemsById,
      songsById,
      eventBonus,
      perfectRatePercentText,
      songs: medleySongInputs,
    });
    return runGreenfieldMedleySearch({
      request,
      input: medleyInput,
      effectiveCards,
      cardsById,
      options,
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
): Promise<TeamSearchWorkerSearchResult> {
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
    event.data.event.eventType === "medley" && event.data.songs?.length === 3,
  );
  void runSearch(event.data, {
    onMedleyProgress: shouldReportMedleyProgress
      ? (progress) => {
        self.postMessage({
          requestId: event.data.requestId,
          type: "search-progress",
          ok: true,
          partial: true,
          result: null,
          progress,
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
        error: formatSearchError(error, messages),
      } satisfies TeamSearchWorkerResponse);
    });
};

export {};
