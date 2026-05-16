import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { fetchBandoriEventBonuses } from "@/lib/bandori-events-server";
import {
  isBandoriTeamSearchDifficulty,
  searchBandoriBestTeams,
  type BestdoriChartEntity,
  type BestdoriSongMaster,
  type BandoriTeamSearchDifficulty,
} from "@/lib/bandori-team-search";
import {
  type BandoriCharacterBonusState,
  type BestdoriAreaItemMaster,
  type BestdoriCardMaster,
  type BestdoriSkillMaster,
} from "@/lib/bandori-team-calculator";
import { fetchBestdoriChart, fetchBestdoriMasterDataset } from "@/lib/bestdori-master-data";
import { requireVerifiedAccount } from "@/lib/auth-server";
import {
  getGameProfileAreaItems,
  getGameProfileCards,
  getGameProfileCharacterMissionBonuses,
  getGameProfileCharacterPotentials,
} from "@/lib/user-game-profile-payload";
import { normalizeProfileId, readGameProfilePayload } from "@/lib/user-game-profiles-server";

type RouteContext = {
  params: Promise<{
    profileId: string;
  }>;
};

type TeamBuilderSearchBody = {
  songId?: unknown;
  difficulty?: unknown;
  eventId?: unknown;
  resultLimit?: unknown;
  perfectRate?: unknown;
  useFever?: unknown;
  useSpecialRoomBonus?: unknown;
  maxSearchDurationMs?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toOptionalFiniteNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function readInteger(value: unknown, fieldName: string): number {
  const numeric = toOptionalFiniteNumber(value);
  if (numeric === undefined) {
    throw new ApiRouteError(400, "INVALID_TEAM_BUILDER_REQUEST", `${fieldName} must be a number`);
  }

  return Math.trunc(numeric);
}

function readOptionalInteger(value: unknown, fieldName: string): number | undefined {
  const numeric = toOptionalFiniteNumber(value);
  if (numeric === undefined) {
    return undefined;
  }

  if (!Number.isFinite(numeric)) {
    throw new ApiRouteError(400, "INVALID_TEAM_BUILDER_REQUEST", `${fieldName} must be a number`);
  }

  return Math.trunc(numeric);
}

function readDifficulty(value: unknown): BandoriTeamSearchDifficulty {
  if (typeof value !== "string" || !isBandoriTeamSearchDifficulty(value)) {
    throw new ApiRouteError(400, "INVALID_CHART_DIFFICULTY", "Invalid chart difficulty");
  }

  return value;
}

function buildCharacterBonuses(
  potentials: ReturnType<typeof getGameProfileCharacterPotentials>,
  missionBonuses: ReturnType<typeof getGameProfileCharacterMissionBonuses>,
): BandoriCharacterBonusState[] {
  const records = new Map<number, BandoriCharacterBonusState>();

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
    record.missionBonusPercent = {
      performance: (current.performance ?? 0) + bonus.performance / 10,
      technique: (current.technique ?? 0) + bonus.technique / 10,
      visual: (current.visual ?? 0) + bonus.visual / 10,
    };
    records.set(bonus.characterId, record);
  });

  return [...records.values()];
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireVerifiedAccount(request);
    const { profileId: rawProfileId } = await context.params;
    const profileId = normalizeProfileId(rawProfileId);
    let body: TeamBuilderSearchBody;

    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "Request body must be valid JSON");
    }

    if (!isRecord(body)) {
      throw new ApiRouteError(400, "INVALID_TEAM_BUILDER_REQUEST", "Request body must be an object");
    }

    const songId = readInteger(body.songId, "songId");
    if (songId <= 0) {
      throw new ApiRouteError(400, "INVALID_SONG_ID", "Invalid song id");
    }

    const difficulty = readDifficulty(body.difficulty);
    const resultLimit = readOptionalInteger(body.resultLimit, "resultLimit") ?? 10;
    if (resultLimit < 1 || resultLimit > 50) {
      throw new ApiRouteError(400, "INVALID_RESULT_LIMIT", "resultLimit must be between 1 and 50");
    }

    const perfectRate = toOptionalFiniteNumber(body.perfectRate) ?? 1;
    if (perfectRate < 0 || perfectRate > 1) {
      throw new ApiRouteError(400, "INVALID_PERFECT_RATE", "perfectRate must be between 0 and 1");
    }

    const maxSearchDurationMs = readOptionalInteger(body.maxSearchDurationMs, "maxSearchDurationMs") ?? 9000;
    if (maxSearchDurationMs < 1000 || maxSearchDurationMs > 9500) {
      throw new ApiRouteError(400, "INVALID_MAX_SEARCH_DURATION", "maxSearchDurationMs must be between 1000 and 9500");
    }

    const eventId = readOptionalInteger(body.eventId, "eventId");
    if (eventId !== undefined && eventId <= 0) {
      throw new ApiRouteError(400, "INVALID_EVENT_ID", "Invalid event id");
    }

    const payload = await readGameProfilePayload(user.id, profileId);
    const [cardsPayload, charactersPayload, skillsPayload, areaItemsPayload, songsPayload, chartPayload, eventBonuses] = await Promise.all([
      fetchBestdoriMasterDataset("cards"),
      fetchBestdoriMasterDataset("characters"),
      fetchBestdoriMasterDataset("skills"),
      fetchBestdoriMasterDataset("areaItems"),
      fetchBestdoriMasterDataset("songs"),
      fetchBestdoriChart(songId, difficulty),
      eventId === undefined ? Promise.resolve([]) : fetchBandoriEventBonuses({ eventId }),
    ]);
    const songsById = songsPayload as Record<string, BestdoriSongMaster | undefined>;
    const song = songsById[String(songId)];
    if (!song) {
      throw new ApiRouteError(404, "BANDORI_SONG_NOT_FOUND", "Bandori song was not found");
    }
    if (!Array.isArray(chartPayload)) {
      throw new ApiRouteError(502, "BANDORI_CHART_INVALID", "Bandori chart payload was invalid");
    }
    if (eventId !== undefined && eventBonuses.length === 0) {
      throw new ApiRouteError(404, "BANDORI_EVENT_BONUS_NOT_FOUND", "Bandori event bonus was not found");
    }

    const cards = getGameProfileCards(payload);
    const areaItems = getGameProfileAreaItems(payload).flatMap((item) => (
      item.areaItemId === null ? [] : {
        areaItemId: item.areaItemId,
        level: item.level,
      }
    ));
    const searchResult = searchBandoriBestTeams({
      userCards: cards,
      userAreaItems: areaItems,
      characterBonuses: buildCharacterBonuses(
        getGameProfileCharacterPotentials(payload),
        getGameProfileCharacterMissionBonuses(payload),
      ),
      cardsById: cardsPayload as Record<string, BestdoriCardMaster | undefined>,
      charactersById: charactersPayload as Record<string, { bandId?: number | null } | undefined>,
      skillsById: skillsPayload as Record<string, BestdoriSkillMaster | undefined>,
      areaItemsById: areaItemsPayload as Record<string, BestdoriAreaItemMaster | undefined>,
      chart: chartPayload as BestdoriChartEntity[],
      song,
      difficulty,
      eventBonus: eventBonuses[0] ?? null,
      resultLimit,
      perfectRate,
      useFever: body.useFever === true,
      useSpecialRoomBonus: body.useSpecialRoomBonus === true,
      server: payload.bestdoriProfile.server,
      maxSearchDurationMs,
    });

    return jsonSuccess(searchResult);
  } catch (error) {
    console.error("Bandori team builder search API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_TEAM_BUILDER_SEARCH_FAILED",
      message: "Failed to search Bandori teams",
    });
  }
}
