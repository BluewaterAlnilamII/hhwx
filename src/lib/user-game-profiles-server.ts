import { ApiRouteError } from "@/lib/api-contracts";
import { BANDORI_CARD_EPISODE_METADATA } from "@/lib/bandori-card-episode-metadata";
import {
  BESTDORI_CN_SERVER_ID,
  decodeBestdoriProfile,
  encodeBestdoriProfile,
  parseBestdoriProfile,
  type BestdoriProfile,
  type NormalizedBestdoriCard,
  type NormalizedBestdoriProfile,
} from "@/lib/bestdori-profile-codec";
import { fetchGameUserSnapshot, type TrackerUserSnapshotPayload } from "@/lib/user-game-snapshot-fetcher";
import {
  BANDORI_AREA_ITEM_IDS,
  BANDORI_AREA_ITEM_IDS_BY_GROUP,
} from "@/lib/bandori-area-item-groups";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  USER_GAME_BINDINGS_TABLE,
  USER_GAME_PROFILES_TABLE,
} from "@/lib/supabase-table-names";
import {
  USER_GAME_PROFILE_STORAGE_CODEC,
  compactMissionBonusRecords,
  compactPotentialRecords,
  exportBestdoriGameProfilePayload,
  exportCompactGameProfilePayload,
  getGameProfileAreaItems,
  getGameProfileCardCount,
  getGameProfileCards,
  getGameProfileCharacterMissionBonuses,
  getGameProfileCharacterPotentials,
  type CompleteGameProfileExport,
  type CompressedGameProfilePayload,
  type UserGameProfileCardRecord,
  type UserGameProfileMissionBonusRecord,
  type UserGameProfilePayload,
  type UserGameProfilePotentialRecord,
} from "@/lib/user-game-profile-payload";
import { decodeGameProfilePayload, encodeGameProfilePayload } from "@/lib/user-game-profile-payload-server";

export const USER_GAME_BINDING_LIMIT = 5;
export const USER_GAME_AUTO_PROFILE_LIMIT = 5;
export const USER_GAME_MANUAL_PROFILE_LIMIT = 10;

export type UserGameProfileKind = "auto" | "manual";

export type UserGameProfileSummary = {
  id: string;
  kind: UserGameProfileKind;
  name: string;
  server: number;
  sourceGameUid: string | null;
  isEditable: boolean;
  cardCount: number;
  syncedAt: string | null;
  updatedAt: string;
};

type UserGameProfileRow = {
  id: string;
  profile_kind: UserGameProfileKind;
  profile_name: string;
  server: number;
  source_game_uid: string | null;
  storage_codec: string;
  payload_compressed: string;
  payload_sha256: string;
  payload_size: number;
  card_count: number | null;
  summary: unknown;
  synced_at: string | null;
  updated_at: string;
};

type TrackerCard = {
  situation_id?: unknown;
  level?: unknown;
  skill_level?: unknown;
  training_status?: unknown;
  limit_break_rank?: unknown;
  illust?: unknown;
  append_parameter?: unknown;
};

type TrackerAreaItem = {
  area_item_id?: unknown;
  area_item_category?: unknown;
  level?: unknown;
};

type TrackerAreaItemDetail = TrackerAreaItem & {
  category_id?: unknown;
  resource_id?: unknown;
  user_level?: unknown;
  is_owned?: unknown;
};

type TrackerPotential = {
  character_id?: unknown;
  performance_level?: unknown;
  technique_level?: unknown;
  visual_level?: unknown;
};

type TrackerMissionBonus = {
  character_id?: unknown;
  bonus_type?: unknown;
  performance?: unknown;
  technique?: unknown;
  visual?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toInteger(value: unknown, fallback = 0): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? Math.trunc(numberValue) : fallback;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function inferEpisodeCountFromAppendParameter(cardId: number, masterRank: number, appendParameter: unknown, isTrained: boolean): number {
  if (!isRecord(appendParameter)) {
    return 0;
  }

  const performance = toInteger(appendParameter.performance);
  const technique = toInteger(appendParameter.technique);
  const visual = toInteger(appendParameter.visual);
  if (performance <= 0 && technique <= 0 && visual <= 0) {
    return 0;
  }

  if (performance !== technique || performance !== visual) {
    return 0;
  }

  const metadata = BANDORI_CARD_EPISODE_METADATA[cardId];
  if (metadata) {
    const [rarity, firstEpisodeBonus, secondEpisodeBonus, trainingBonus] = metadata;
    const nonEpisodeBonus = (masterRank * rarity * 50) + (isTrained ? trainingBonus : 0);
    const episodeBonus = performance - nonEpisodeBonus;
    if (trainingBonus === 0 && firstEpisodeBonus === 0 && secondEpisodeBonus > 0) {
      return episodeBonus === secondEpisodeBonus ? 2 : 0;
    }

    const readableEpisodeBonuses = [firstEpisodeBonus, secondEpisodeBonus].filter((bonus) => bonus > 0);
    if (episodeBonus <= 0 || readableEpisodeBonuses.length === 0) {
      return 0;
    }
    if (episodeBonus === readableEpisodeBonuses.reduce((total, bonus) => total + bonus, 0)) {
      return readableEpisodeBonuses.length;
    }
    if (readableEpisodeBonuses.includes(episodeBonus)) {
      return 1;
    }
    return 0;
  }

  const untrainedEpisodeCounts = new Map([
    [100, 1],
    [150, 1],
    [200, 1],
    [250, 1],
    [300, 2],
    [450, 2],
    [700, 2],
    [850, 2],
  ]);
  const trainedEpisodeCounts = new Map([
    [500, 1],
    [650, 1],
    [800, 1],
    [850, 2],
    [1000, 2],
    [1250, 2],
    [1500, 2],
    [1600, 2],
    [1850, 2],
    [2050, 2],
    [2250, 2],
  ]);

  if (isTrained) {
    return trainedEpisodeCounts.get(performance) ?? untrainedEpisodeCounts.get(performance) ?? 0;
  }

  return untrainedEpisodeCounts.get(performance) ?? 0;
}

function toProfileSummary(row: UserGameProfileRow): UserGameProfileSummary {
  return {
    id: row.id,
    kind: row.profile_kind,
    name: row.profile_name,
    server: row.server,
    sourceGameUid: row.source_game_uid,
    isEditable: row.profile_kind === "manual",
    cardCount: row.card_count ?? 0,
    syncedAt: row.synced_at,
    updatedAt: row.updated_at,
  };
}

function normalizeProfileName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) {
    throw new ApiRouteError(400, "INVALID_PROFILE_NAME", "请输入 Profile 名称");
  }

  if (name.length > 40) {
    throw new ApiRouteError(400, "PROFILE_NAME_TOO_LONG", "Profile 名称不能超过 40 个字符");
  }

  return name;
}

export function normalizeProfileId(value: unknown): string {
  const profileId = typeof value === "string" ? value.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profileId)) {
    throw new ApiRouteError(400, "INVALID_PROFILE_ID", "无效的 Profile ID");
  }

  return profileId;
}

function getSnapshotSuiteUser(snapshot: TrackerUserSnapshotPayload): Record<string, unknown> {
  return isRecord(snapshot.snapshot?.suite_user) ? snapshot.snapshot.suite_user : {};
}

function getSnapshotProfile(snapshot: TrackerUserSnapshotPayload): Record<string, unknown> {
  return isRecord(snapshot.snapshot?.profile) ? snapshot.snapshot.profile : {};
}

function toNormalizedCards(cards: unknown): NormalizedBestdoriCard[] {
  if (!Array.isArray(cards)) {
    return [];
  }

  return cards
    .filter(isRecord)
    .map((card: TrackerCard) => {
      const trainingStatus = toStringOrNull(card.training_status)?.toLowerCase() ?? null;
      const illust = toStringOrNull(card.illust)?.toLowerCase() ?? null;
      const skillLevel = Math.max(1, toInteger(card.skill_level, 1));
      const cardId = toInteger(card.situation_id);
      const masterRank = Math.max(0, toInteger(card.limit_break_rank, 0));
      const metadata = BANDORI_CARD_EPISODE_METADATA[cardId];
      const isBestdoriAlwaysTrained = metadata !== undefined && metadata[1] === 0 && metadata[2] > 0 && metadata[3] === 0;
      const canTrain = metadata === undefined || metadata[3] > 0 || isBestdoriAlwaysTrained;
      const isTrained = isBestdoriAlwaysTrained || (canTrain && (trainingStatus === "done"
        || trainingStatus === "trained"
        || trainingStatus === "1"
        || trainingStatus === "true"));

      return {
        cardId,
        level: Math.max(1, toInteger(card.level, 1)),
        masterRank,
        skillLevel,
        episodeCount: inferEpisodeCountFromAppendParameter(cardId, masterRank, card.append_parameter, isTrained),
        isTrained,
        hasTrainedArt: isBestdoriAlwaysTrained || (canTrain && (illust === "after_training" || illust === "1")),
        isExcluded: false,
      };
    })
    .filter((card) => card.cardId > 0)
    .sort((left, right) => left.cardId - right.cardId);
}

const MAX_BANDORI_CHARACTER_ID = 50;

function isPlayableCharacterId(characterId: number): boolean {
  return characterId > 0 && characterId <= MAX_BANDORI_CHARACTER_ID;
}

function resolveBestdoriAreaItemId(rawAreaItemId: number, detail?: TrackerAreaItemDetail): number | null {
  const candidateIds = [
    toInteger(detail?.resource_id),
    toInteger(detail?.category_id),
    rawAreaItemId,
    toInteger(detail?.area_item_id),
  ];

  return candidateIds.find((candidateId) => candidateId > 0 && BANDORI_AREA_ITEM_IDS.has(candidateId)) ?? null;
}

function findAreaItemDetailForUserItem(details: TrackerAreaItemDetail[], item: TrackerAreaItem): TrackerAreaItemDetail | undefined {
  const rawAreaItemId = toInteger(item.area_item_id);
  const areaItemCategory = toInteger(item.area_item_category);
  const level = toInteger(item.level);

  return details.find((detail) => toInteger(detail.area_item_id) === rawAreaItemId)
    ?? details.find((detail) => (
      areaItemCategory > 0
      && level > 0
      && toInteger(detail.category_id) === areaItemCategory
      && toInteger(detail.level) === level
    ));
}

function collectAreaItemLevelsByBestdoriId(areaItems: unknown, areaItemDetails?: unknown): Map<number, number> {
  const levelsById = new Map<number, number>();
  const details = Array.isArray(areaItemDetails)
    ? areaItemDetails.filter(isRecord) as TrackerAreaItemDetail[]
    : [];

  details.forEach((detail) => {
    const rawAreaItemId = toInteger(detail.area_item_id);
    const bestdoriAreaItemId = resolveBestdoriAreaItemId(rawAreaItemId, detail);
    const userLevel = detail.user_level === null || detail.user_level === undefined ? null : Math.max(0, toInteger(detail.user_level));
    if (bestdoriAreaItemId !== null && detail.is_owned === true && userLevel !== null) {
      levelsById.set(bestdoriAreaItemId, userLevel);
    }
  });

  if (Array.isArray(areaItems)) {
    areaItems.filter(isRecord).forEach((item: TrackerAreaItem) => {
      const rawAreaItemId = toInteger(item.area_item_id);
      const detail = findAreaItemDetailForUserItem(details, item);
      const bestdoriAreaItemId = resolveBestdoriAreaItemId(rawAreaItemId, detail);
      if (bestdoriAreaItemId !== null) {
        levelsById.set(bestdoriAreaItemId, Math.max(0, toInteger(item.level)));
      }
    });
  }

  return levelsById;
}

function toBestdoriItems(areaItems: unknown, areaItemDetails?: unknown): Record<string, Array<number | null>> {
  const levelsById = collectAreaItemLevelsByBestdoriId(areaItems, areaItemDetails);
  const result: Record<string, Array<number | null>> = {};
  Object.entries(BANDORI_AREA_ITEM_IDS_BY_GROUP).forEach(([key, ids]) => {
    result[key] = ids.map((id) => levelsById.get(id) ?? null);
  });
  return result;
}

function normalizeMissionBonusTenthPercent(value: unknown): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return 0;
  }

  if (numericValue <= 11) {
    return Math.round(numericValue * 10);
  }

  return Math.round(numericValue);
}

function toPotentialPayloadRows(rawPotentials: unknown): UserGameProfilePotentialRecord[] {
  if (Array.isArray(rawPotentials)) {
    const rows = rawPotentials.filter(isRecord).map((item: TrackerPotential) => {
      const performanceLevel = toInteger(item.performance_level);
      const techniqueLevel = toInteger(item.technique_level);
      const visualLevel = toInteger(item.visual_level);
      return {
        characterId: toInteger(item.character_id),
        performanceLevel,
        techniqueLevel,
        visualLevel,
      };
    }).filter((item) => isPlayableCharacterId(item.characterId));

    if (rows.length > 0) {
      return rows;
    }
  }

  return [];
}

function completeMissionBonusRows(records: UserGameProfileMissionBonusRecord[], characterCount: number): UserGameProfileMissionBonusRecord[] {
  const completed = [...records];
  const existing = new Set(completed.map((record) => `${record.characterId}:${record.bonusType.toUpperCase()}`));

  for (let characterId = 1; characterId <= Math.min(characterCount, MAX_BANDORI_CHARACTER_ID); characterId += 1) {
    for (const bonusType of ["COLLECTION", "TRAINING"]) {
      const key = `${characterId}:${bonusType}`;
      if (!existing.has(key)) {
        completed.push({
          characterId,
          bonusType,
          performance: 0,
          technique: 0,
          visual: 0,
        });
        existing.add(key);
      }
    }
  }

  return completed;
}

function toMissionBonusPayloadRows(missionBonuses: unknown, characterCount = 0): UserGameProfileMissionBonusRecord[] {
  if (!Array.isArray(missionBonuses)) {
    return [];
  }

  const rows = missionBonuses.filter(isRecord).map((bonus: TrackerMissionBonus) => ({
    characterId: toInteger(bonus.character_id),
    bonusType: toStringOrNull(bonus.bonus_type) ?? "unknown",
    performance: normalizeMissionBonusTenthPercent(bonus.performance),
    technique: normalizeMissionBonusTenthPercent(bonus.technique),
    visual: normalizeMissionBonusTenthPercent(bonus.visual),
  })).filter((bonus) => isPlayableCharacterId(bonus.characterId));
  return completeMissionBonusRows(rows, characterCount);
}

function toPayloadFromNormalizedProfile(
  normalizedProfile: NormalizedBestdoriProfile,
  options: {
    bestdoriProfile?: BestdoriProfile;
    sourceGameUid?: string;
    syncedAt?: string;
    potentialLevels?: unknown;
    missionBonuses?: unknown;
  } = {},
): UserGameProfilePayload {
  const payload: UserGameProfilePayload = {
    bestdoriProfile: options.bestdoriProfile ?? encodeBestdoriProfile(normalizedProfile),
    source: options.sourceGameUid ? {
      gameUid: options.sourceGameUid,
      syncedAt: options.syncedAt,
    } : undefined,
  };

  if (options.potentialLevels !== undefined) {
    payload.characterPotentials = compactPotentialRecords(toPotentialPayloadRows(options.potentialLevels));
  }

  if (options.missionBonuses !== undefined) {
    payload.characterMissionBonuses = compactMissionBonusRecords(toMissionBonusPayloadRows(options.missionBonuses, getGameProfileCharacterPotentials(payload).length));
  }

  return payload;
}

function snapshotToNormalizedProfile(gameUid: string, snapshot: TrackerUserSnapshotPayload): NormalizedBestdoriProfile {
  const suiteUser = getSnapshotSuiteUser(snapshot);
  const profile = getSnapshotProfile(snapshot);
  const profileName = toStringOrNull(profile.user_name) ?? `UID ${gameUid}`;

  return {
    name: profileName,
    server: BESTDORI_CN_SERVER_ID,
    cards: toNormalizedCards(suiteUser.cards),
    items: toBestdoriItems(suiteUser.area_items, snapshot.snapshot?.area_item_details),
    potentials: [],
  };
}

function compressedFromRow(row: Pick<UserGameProfileRow, "storage_codec" | "payload_compressed" | "payload_sha256" | "payload_size">): CompressedGameProfilePayload {
  return {
    storageCodec: row.storage_codec as typeof USER_GAME_PROFILE_STORAGE_CODEC,
    payloadCompressed: row.payload_compressed,
    payloadSha256: row.payload_sha256,
    payloadSize: row.payload_size,
  };
}

async function readGameProfileRow(webUserId: string, profileId: string): Promise<UserGameProfileRow> {
  const serviceClient = createServerSupabaseClient();
  const { data, error } = await serviceClient
    .from(USER_GAME_PROFILES_TABLE)
    .select("id, profile_kind, profile_name, server, source_game_uid, storage_codec, payload_compressed, payload_sha256, payload_size, card_count, summary, synced_at, updated_at")
    .eq("id", profileId)
    .eq("web_user_id", webUserId)
    .maybeSingle();

  if (error) {
    throw new ApiRouteError(500, "GAME_PROFILE_READ_FAILED", "读取游戏 Profile 失败", error.message);
  }
  if (!data) {
    throw new ApiRouteError(404, "GAME_PROFILE_NOT_FOUND", "Profile 不存在");
  }

  return data as UserGameProfileRow;
}

async function readGameProfileSummary(webUserId: string, profileId: string): Promise<UserGameProfileSummary> {
  return toProfileSummary(await readGameProfileRow(webUserId, profileId));
}

export async function listUserGameProfiles(webUserId: string): Promise<UserGameProfileSummary[]> {
  const serviceClient = createServerSupabaseClient();
  const { data, error } = await serviceClient
    .from(USER_GAME_PROFILES_TABLE)
    .select("id, profile_kind, profile_name, server, source_game_uid, storage_codec, payload_compressed, payload_sha256, payload_size, card_count, summary, synced_at, updated_at")
    .eq("web_user_id", webUserId)
    .order("profile_kind", { ascending: true })
    .order("updated_at", { ascending: false });

  if (error) {
    throw new ApiRouteError(500, "GAME_PROFILES_READ_FAILED", "读取游戏 Profile 失败", error.message);
  }

  return ((data ?? []) as UserGameProfileRow[]).map(toProfileSummary);
}

export async function createManualGameProfile(webUserId: string, name: unknown): Promise<UserGameProfileSummary> {
  const profileName = normalizeProfileName(name);
  const normalizedProfile: NormalizedBestdoriProfile = {
    name: profileName,
    server: BESTDORI_CN_SERVER_ID,
    cards: [],
    items: {},
    potentials: [],
  };
  const payload = toPayloadFromNormalizedProfile(normalizedProfile);
  const compressed = encodeGameProfilePayload(payload);
  const serviceClient = createServerSupabaseClient();
  const { data, error } = await serviceClient.rpc("create_manual_game_profile", {
    p_web_user_id: webUserId,
    p_profile_name: profileName,
    p_payload_compressed: compressed.payloadCompressed,
    p_payload_sha256: compressed.payloadSha256,
    p_payload_size: compressed.payloadSize,
    p_card_count: getGameProfileCardCount(payload),
    p_summary: {},
  });

  if (error) {
    throw new ApiRouteError(400, "MANUAL_GAME_PROFILE_CREATE_FAILED", "创建手动 Profile 失败", error.message);
  }

  return toProfileSummary(data as UserGameProfileRow);
}

export async function importManualGameProfile(webUserId: string, rawProfile: unknown): Promise<UserGameProfileSummary> {
  const bestdoriProfile = parseBestdoriProfile(rawProfile);
  const normalizedProfile = decodeBestdoriProfile(bestdoriProfile);
  const payload = toPayloadFromNormalizedProfile(normalizedProfile, { bestdoriProfile });
  const compressed = encodeGameProfilePayload(payload);
  const serviceClient = createServerSupabaseClient();
  const { data, error } = await serviceClient.rpc("create_manual_game_profile", {
    p_web_user_id: webUserId,
    p_profile_name: normalizedProfile.name,
    p_payload_compressed: compressed.payloadCompressed,
    p_payload_sha256: compressed.payloadSha256,
    p_payload_size: compressed.payloadSize,
    p_card_count: getGameProfileCardCount(payload),
    p_summary: {},
  });

  if (error) {
    throw new ApiRouteError(400, "MANUAL_GAME_PROFILE_IMPORT_FAILED", "导入 Bestdori Profile 失败", error.message);
  }

  return toProfileSummary(data as UserGameProfileRow);
}

export async function uploadManualGameProfilePayload(
  webUserId: string,
  name: unknown,
  compressed: CompressedGameProfilePayload,
): Promise<UserGameProfileSummary> {
  const payload = decodeGameProfilePayload(compressed);
  const profileName = normalizeProfileName(name || payload.bestdoriProfile.name || "Manual Profile");
  payload.bestdoriProfile.name = profileName;
  const nextCompressed = encodeGameProfilePayload(payload);
  const serviceClient = createServerSupabaseClient();
  const { data, error } = await serviceClient.rpc("create_manual_game_profile", {
    p_web_user_id: webUserId,
    p_profile_name: profileName,
    p_payload_compressed: nextCompressed.payloadCompressed,
    p_payload_sha256: nextCompressed.payloadSha256,
    p_payload_size: nextCompressed.payloadSize,
    p_card_count: getGameProfileCardCount(payload),
    p_summary: {},
  });

  if (error) {
    throw new ApiRouteError(400, "MANUAL_GAME_PROFILE_UPLOAD_FAILED", "上传手动 Profile 失败", error.message);
  }

  return toProfileSummary(data as UserGameProfileRow);
}

export async function copyGameProfileToManual(webUserId: string, profileId: string, name?: unknown): Promise<UserGameProfileSummary> {
  const source = await readGameProfileRow(webUserId, profileId);
  const payload = decodeGameProfilePayload(compressedFromRow(source));
  const profileName = typeof name === "string" && name.trim() ? normalizeProfileName(name) : `${source.profile_name} Copy`;
  const nextPayload: UserGameProfilePayload = {
    ...payload,
    bestdoriProfile: {
      ...payload.bestdoriProfile,
      name: profileName,
    },
    source: undefined,
  };
  const compressed = encodeGameProfilePayload(nextPayload);
  const serviceClient = createServerSupabaseClient();
  const { data, error } = await serviceClient.rpc("create_manual_game_profile", {
    p_web_user_id: webUserId,
    p_profile_name: profileName,
    p_payload_compressed: compressed.payloadCompressed,
    p_payload_sha256: compressed.payloadSha256,
    p_payload_size: compressed.payloadSize,
    p_card_count: getGameProfileCardCount(nextPayload),
    p_summary: {},
  });

  if (error) {
    throw new ApiRouteError(400, "GAME_PROFILE_COPY_FAILED", "复制 Profile 失败", error.message);
  }

  return toProfileSummary(data as UserGameProfileRow);
}

export async function syncAutoGameProfile(webUserId: string, gameUid: string): Promise<UserGameProfileSummary> {
  const serviceClient = createServerSupabaseClient();
  const { data: binding, error: bindingError } = await serviceClient
    .from(USER_GAME_BINDINGS_TABLE)
    .select("game_uid")
    .eq("web_user_id", webUserId)
    .eq("game_uid", gameUid)
    .maybeSingle();

  if (bindingError) {
    throw new ApiRouteError(500, "GAME_BINDING_READ_FAILED", "读取游戏账号绑定失败", bindingError.message);
  }
  if (!binding) {
    throw new ApiRouteError(403, "GAME_UID_NOT_BOUND", "该游戏 UID 尚未绑定到当前账号");
  }

  const snapshot = await fetchGameUserSnapshot(gameUid);
  const normalizedProfile = snapshotToNormalizedProfile(gameUid, snapshot);
  const summary = isRecord(snapshot.summary) ? snapshot.summary : {};
  const suiteUser = getSnapshotSuiteUser(snapshot);
  const syncedAt = new Date().toISOString();
  const payload = toPayloadFromNormalizedProfile(normalizedProfile, {
    sourceGameUid: gameUid,
    syncedAt,
    potentialLevels: suiteUser.character_potential_levels,
    missionBonuses: suiteUser.character_mission_bonuses,
  });
  const compressed = encodeGameProfilePayload(payload);

  const { data, error } = await serviceClient.rpc("upsert_auto_game_profile", {
    p_web_user_id: webUserId,
    p_game_uid: gameUid,
    p_profile_name: normalizedProfile.name,
    p_payload_compressed: compressed.payloadCompressed,
    p_payload_sha256: compressed.payloadSha256,
    p_payload_size: compressed.payloadSize,
    p_card_count: getGameProfileCardCount(payload),
    p_summary: summary,
  });

  if (error) {
    throw new ApiRouteError(400, "AUTO_GAME_PROFILE_SYNC_FAILED", "保存自动 Profile 失败", error.message);
  }

  return readGameProfileSummary(webUserId, (data as UserGameProfileRow).id);
}

export async function readCompressedGameProfilePayload(webUserId: string, profileId: string): Promise<CompressedGameProfilePayload> {
  return compressedFromRow(await readGameProfileRow(webUserId, profileId));
}

export async function readGameProfilePayload(webUserId: string, profileId: string): Promise<UserGameProfilePayload> {
  return decodeGameProfilePayload(await readCompressedGameProfilePayload(webUserId, profileId));
}

export async function updateGameProfilePayload(
  webUserId: string,
  profileId: string,
  payload: UserGameProfilePayload,
): Promise<UserGameProfileSummary> {
  const existing = await readGameProfileRow(webUserId, profileId);
  if (existing.profile_kind !== "manual") {
    throw new ApiRouteError(403, "GAME_PROFILE_NOT_EDITABLE", "自动同步 Profile 不允许编辑");
  }

  const compressed = encodeGameProfilePayload(payload);
  const serviceClient = createServerSupabaseClient();
  const { data, error } = await serviceClient
    .from(USER_GAME_PROFILES_TABLE)
    .update({
      storage_codec: compressed.storageCodec,
      payload_compressed: compressed.payloadCompressed,
      payload_sha256: compressed.payloadSha256,
      payload_size: compressed.payloadSize,
      card_count: getGameProfileCardCount(payload),
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId)
    .eq("web_user_id", webUserId)
    .select("id, profile_kind, profile_name, server, source_game_uid, storage_codec, payload_compressed, payload_sha256, payload_size, card_count, summary, synced_at, updated_at")
    .maybeSingle();

  if (error) {
    throw new ApiRouteError(500, "GAME_PROFILE_UPDATE_FAILED", "保存 Profile 数据失败", error.message);
  }
  if (!data) {
    throw new ApiRouteError(404, "GAME_PROFILE_NOT_FOUND", "Profile 不存在");
  }

  return toProfileSummary({
    ...existing,
    ...(data as UserGameProfileRow),
  });
}

export async function exportBestdoriGameProfile(webUserId: string, profileId: string): Promise<BestdoriProfile> {
  return readGameProfilePayload(webUserId, profileId).then(exportBestdoriGameProfilePayload);
}

export async function exportCompleteGameProfile(webUserId: string, profileId: string): Promise<CompleteGameProfileExport> {
  const row = await readGameProfileRow(webUserId, profileId);
  const payload = decodeGameProfilePayload(compressedFromRow(row));
  return exportCompactGameProfilePayload(payload);
}

export async function deleteGameProfile(webUserId: string, profileId: string): Promise<void> {
  const serviceClient = createServerSupabaseClient();
  const { error } = await serviceClient
    .from(USER_GAME_PROFILES_TABLE)
    .delete()
    .eq("id", profileId)
    .eq("web_user_id", webUserId);

  if (error) {
    throw new ApiRouteError(500, "GAME_PROFILE_DELETE_FAILED", "删除 Profile 失败", error.message);
  }
}

export async function listGameProfileCards(webUserId: string, profileId: string): Promise<UserGameProfileCardRecord[]> {
  return readGameProfilePayload(webUserId, profileId).then(getGameProfileCards);
}

export async function readGameProfileItemsView(webUserId: string, profileId: string) {
  const payload = await readGameProfilePayload(webUserId, profileId);
  return {
    areaItems: getGameProfileAreaItems(payload),
    characterPotentials: getGameProfileCharacterPotentials(payload),
    characterMissionBonuses: getGameProfileCharacterMissionBonuses(payload),
  };
}
