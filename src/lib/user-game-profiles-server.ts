import { createHash } from "node:crypto";
import { ApiRouteError } from "@/lib/api-contracts";
import { BANDORI_CARD_EPISODE_METADATA } from "@/lib/bandori/data/card-episode-metadata";
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
  getGameProfileAreaItems,
  getGameProfileCardCount,
  getGameProfileCards,
  getGameProfileCharacterMissionBonuses,
  getGameProfileCharacterPotentials,
  importBestdoriGameProfilePayload,
  type CompressedGameProfilePayload,
  type UserGameProfileCardRecord,
  type UserGameProfileItemRecord,
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
  localProfileId: string | null;
  isEditable: boolean;
  cardCount: number;
  syncedAt: string | null;
  updatedAt: string;
};

export type UserGameProfilePayloadProfile = Pick<
  UserGameProfileSummary,
  "id" | "kind" | "name" | "isEditable" | "updatedAt"
>;

export type UserGameProfileSectionVersions = {
  cardsHash: string;
  itemsHash: string;
};

export type UserGameProfilePayloadResponse = {
  compressed: CompressedGameProfilePayload;
  profile: UserGameProfilePayloadProfile;
  sectionVersions: UserGameProfileSectionVersions;
};

export type UserGameProfileSectionUpdateResult = {
  profile: UserGameProfilePayloadProfile;
  sectionVersions: UserGameProfileSectionVersions;
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
  const summary = isRecord(row.summary) ? row.summary : {};
  return {
    id: row.id,
    kind: row.profile_kind,
    name: row.profile_name,
    server: row.server,
    sourceGameUid: row.source_game_uid,
    localProfileId: row.profile_kind === "manual" ? toStringOrNull(summary.localProfileId) : null,
    isEditable: row.profile_kind === "manual",
    cardCount: row.card_count ?? 0,
    syncedAt: row.synced_at,
    updatedAt: row.updated_at,
  };
}

function toPayloadProfile(row: UserGameProfileRow): UserGameProfilePayloadProfile {
  const summary = toProfileSummary(row);
  return {
    id: summary.id,
    kind: summary.kind,
    name: summary.name,
    isEditable: summary.isEditable,
    updatedAt: summary.updatedAt,
  };
}

function hashStableJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizedCardsForHash(payload: UserGameProfilePayload) {
  return getGameProfileCards(payload)
    .map((card) => ({
      cardId: card.cardId,
      level: card.level,
      masterRank: card.masterRank,
      skillLevel: card.skillLevel,
      episodeCount: card.episodeCount,
      isTrained: Boolean(card.isTrained),
      hasTrainedArt: Boolean(card.hasTrainedArt),
      isExcluded: Boolean(card.isExcluded),
    }))
    .sort((left, right) => left.cardId - right.cardId);
}

function normalizedItemsForHash(payload: UserGameProfilePayload) {
  return {
    areaItems: getGameProfileAreaItems(payload)
      .map((item) => ({
        areaItemId: item.areaItemId,
        itemKey: item.itemKey,
        itemCount: item.itemCount,
        level: item.level,
      }))
      .sort((left, right) => (left.areaItemId ?? Number.MAX_SAFE_INTEGER) - (right.areaItemId ?? Number.MAX_SAFE_INTEGER)
        || left.itemKey.localeCompare(right.itemKey)),
    characterPotentials: getGameProfileCharacterPotentials(payload)
      .map((record) => ({
        characterId: record.characterId,
        performanceLevel: record.performanceLevel ?? 0,
        techniqueLevel: record.techniqueLevel ?? 0,
        visualLevel: record.visualLevel ?? 0,
      }))
      .sort((left, right) => left.characterId - right.characterId),
    characterMissionBonuses: getGameProfileCharacterMissionBonuses(payload)
      .map((record) => ({
        characterId: record.characterId,
        bonusType: record.bonusType.toUpperCase(),
        performance: record.performance,
        technique: record.technique,
        visual: record.visual,
      }))
      .sort((left, right) => left.characterId - right.characterId || left.bonusType.localeCompare(right.bonusType)),
  };
}

function getGameProfileSectionVersions(payload: UserGameProfilePayload): UserGameProfileSectionVersions {
  return {
    cardsHash: hashStableJson(normalizedCardsForHash(payload)),
    itemsHash: hashStableJson(normalizedItemsForHash(payload)),
  };
}

function normalizeSectionHash(value: unknown, section: "cards" | "items" | "payload"): string {
  const hash = typeof value === "string" ? value.trim() : "";
  if (!/^[0-9a-f]{64}$/i.test(hash)) {
    throw new ApiRouteError(400, "INVALID_PROFILE_BASE_VERSION", `无效的${section === "cards" ? "卡牌" : section === "items" ? "道具" : "档案"}基线版本`);
  }
  return hash.toLowerCase();
}

function throwSectionConflict(section: "cards" | "items" | "payload"): never {
  throw new ApiRouteError(
    409,
    "GAME_PROFILE_CONFLICT",
    section === "cards"
      ? "卡牌资料已在其他页面更新，请重新载入后再保存"
      : section === "items"
        ? "道具资料已在其他页面更新，请重新载入后再保存"
        : "档案已在其他页面更新，请重新载入后再保存",
    { section },
  );
}

function normalizeProfileName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) {
    throw new ApiRouteError(400, "INVALID_PROFILE_NAME", "请输入档案名称");
  }

  if (name.length > 40) {
    throw new ApiRouteError(400, "PROFILE_NAME_TOO_LONG", "档案名称不能超过 40 个字符");
  }

  return name;
}

export function normalizeProfileId(value: unknown): string {
  const profileId = typeof value === "string" ? value.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profileId)) {
    throw new ApiRouteError(400, "INVALID_PROFILE_ID", "无效的档案 ID");
  }

  return profileId;
}

function normalizeLocalProfileId(value: unknown): string | null {
  const profileId = typeof value === "string" ? value.trim() : "";
  if (!profileId) {
    return null;
  }

  if (!/^local_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profileId)) {
    throw new ApiRouteError(400, "INVALID_LOCAL_PROFILE_ID", "无效的本地档案 ID");
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

function collectAreaItemLevelsByBestdoriId(areaItems: unknown): Map<number, number> {
  const levelsById = new Map<number, number>();
  if (Array.isArray(areaItems)) {
    areaItems.filter(isRecord).forEach((item: TrackerAreaItem) => {
      const areaItemCategory = toInteger(item.area_item_category);
      if (areaItemCategory > 0 && BANDORI_AREA_ITEM_IDS.has(areaItemCategory)) {
        levelsById.set(areaItemCategory, Math.max(0, toInteger(item.level)));
      }
    });
  }

  return levelsById;
}

function toBestdoriItems(areaItems: unknown): Record<string, Array<number | null>> {
  const levelsById = collectAreaItemLevelsByBestdoriId(areaItems);
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
    items: toBestdoriItems(suiteUser.area_items),
    potentials: [],
  };
}

function assertUsableSnapshot(gameUid: string, snapshot: TrackerUserSnapshotPayload, normalizedProfile: NormalizedBestdoriProfile): void {
  const suiteUser = getSnapshotSuiteUser(snapshot);
  if (!Array.isArray(suiteUser.cards) || normalizedProfile.cards.length === 0) {
    throw new ApiRouteError(
      503,
      "GAME_SNAPSHOT_EMPTY",
      "游戏服务器可能正在维护，当前同步结果为空。已取消保存，避免覆盖现有档案。",
      { gameUid },
    );
  }
}

function compressedFromRow(row: Pick<UserGameProfileRow, "storage_codec" | "payload_compressed" | "payload_sha256" | "payload_size">): CompressedGameProfilePayload {
  return {
    storageCodec: row.storage_codec as typeof USER_GAME_PROFILE_STORAGE_CODEC,
    payloadCompressed: row.payload_compressed,
    payloadSha256: row.payload_sha256,
    payloadSize: row.payload_size,
  };
}

function payloadResponseFromRow(row: UserGameProfileRow, payload?: UserGameProfilePayload): UserGameProfilePayloadResponse {
  const compressed = compressedFromRow(row);
  const decodedPayload = payload ?? decodeGameProfilePayload(compressed);
  return {
    compressed,
    profile: toPayloadProfile(row),
    sectionVersions: getGameProfileSectionVersions(decodedPayload),
  };
}

function sectionUpdateResultFromRow(row: UserGameProfileRow, payload: UserGameProfilePayload): UserGameProfileSectionUpdateResult {
  return {
    profile: toPayloadProfile(row),
    sectionVersions: getGameProfileSectionVersions(payload),
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
    throw new ApiRouteError(500, "GAME_PROFILE_READ_FAILED", "读取游戏档案失败", error.message);
  }
  if (!data) {
    throw new ApiRouteError(404, "GAME_PROFILE_NOT_FOUND", "档案不存在");
  }

  return data as UserGameProfileRow;
}

async function readGameProfileSummary(webUserId: string, profileId: string): Promise<UserGameProfileSummary> {
  return toProfileSummary(await readGameProfileRow(webUserId, profileId));
}

async function writeManualGameProfilePayload(
  webUserId: string,
  profileId: string,
  payload: UserGameProfilePayload,
  expectedPayloadSha256: string,
): Promise<UserGameProfileRow | null> {
  const compressed = encodeGameProfilePayload(payload);
  const serviceClient = createServerSupabaseClient();
  const { data, error } = await serviceClient
    .from(USER_GAME_PROFILES_TABLE)
    .update({
      profile_name: payload.bestdoriProfile.name || "手动档案",
      server: payload.bestdoriProfile.server,
      storage_codec: compressed.storageCodec,
      payload_compressed: compressed.payloadCompressed,
      payload_sha256: compressed.payloadSha256,
      payload_size: compressed.payloadSize,
      card_count: getGameProfileCardCount(payload),
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId)
    .eq("web_user_id", webUserId)
    .eq("profile_kind", "manual")
    .eq("payload_sha256", expectedPayloadSha256)
    .select("id, profile_kind, profile_name, server, source_game_uid, storage_codec, payload_compressed, payload_sha256, payload_size, card_count, summary, synced_at, updated_at")
    .maybeSingle();

  if (error) {
    throw new ApiRouteError(500, "GAME_PROFILE_UPDATE_FAILED", "保存档案数据失败", error.message);
  }

  return data as UserGameProfileRow | null;
}

function assertManualProfile(row: UserGameProfileRow): void {
  if (row.profile_kind !== "manual") {
    throw new ApiRouteError(403, "GAME_PROFILE_NOT_EDITABLE", "自动同步档案不允许编辑");
  }
}

function normalizeCardRows(cards: unknown): UserGameProfileCardRecord[] {
  if (!Array.isArray(cards)) {
    throw new ApiRouteError(400, "INVALID_PROFILE_CARDS", "请提供卡牌资料");
  }

  return cards
    .filter(isRecord)
    .map((card) => ({
      cardId: toInteger(card.cardId),
      level: Math.max(1, toInteger(card.level, 1)),
      masterRank: Math.max(0, toInteger(card.masterRank)),
      skillLevel: Math.max(1, toInteger(card.skillLevel, 1)),
      episodeCount: Math.max(0, toInteger(card.episodeCount)),
      isTrained: Boolean(card.isTrained),
      hasTrainedArt: Boolean(card.hasTrainedArt),
      isExcluded: Boolean(card.isExcluded),
    }))
    .filter((card) => card.cardId > 0)
    .sort((left, right) => left.cardId - right.cardId);
}

function normalizeAreaItemRows(areaItems: unknown): UserGameProfileItemRecord[] {
  if (!Array.isArray(areaItems)) {
    throw new ApiRouteError(400, "INVALID_PROFILE_ITEMS", "请提供区域道具资料");
  }

  return areaItems
    .filter(isRecord)
    .map((item) => {
      const areaItemId = item.areaItemId === null ? null : toInteger(item.areaItemId);
      return {
        itemKey: typeof item.itemKey === "string" && item.itemKey.trim() ? item.itemKey.trim() : `${areaItemId ?? "unknown"}`,
        areaItemId: areaItemId && areaItemId > 0 ? areaItemId : null,
        itemCount: Math.max(0, toInteger(item.itemCount, 1)),
        level: Math.max(0, toInteger(item.level)),
      };
    });
}

function normalizePotentialRows(potentials: unknown): UserGameProfilePotentialRecord[] {
  if (!Array.isArray(potentials)) {
    throw new ApiRouteError(400, "INVALID_PROFILE_POTENTIALS", "请提供角色潜能资料");
  }

  return potentials
    .filter(isRecord)
    .map((record) => ({
      characterId: toInteger(record.characterId),
      performanceLevel: Math.max(0, toInteger(record.performanceLevel)),
      techniqueLevel: Math.max(0, toInteger(record.techniqueLevel)),
      visualLevel: Math.max(0, toInteger(record.visualLevel)),
    }))
    .filter((record) => isPlayableCharacterId(record.characterId))
    .sort((left, right) => left.characterId - right.characterId);
}

function normalizeMissionBonusRows(records: unknown): UserGameProfileMissionBonusRecord[] {
  if (!Array.isArray(records)) {
    throw new ApiRouteError(400, "INVALID_PROFILE_MISSION_BONUSES", "请提供角色任务加成资料");
  }

  return records
    .filter(isRecord)
    .map((record) => ({
      characterId: toInteger(record.characterId),
      bonusType: toStringOrNull(record.bonusType)?.toUpperCase() === "TRAINING" ? "TRAINING" : "COLLECTION",
      performance: Math.max(0, toInteger(record.performance)),
      technique: Math.max(0, toInteger(record.technique)),
      visual: Math.max(0, toInteger(record.visual)),
    }))
    .filter((record) => isPlayableCharacterId(record.characterId))
    .sort((left, right) => left.characterId - right.characterId || left.bonusType.localeCompare(right.bonusType));
}

function buildPayloadWithCards(payload: UserGameProfilePayload, cards: UserGameProfileCardRecord[]): UserGameProfilePayload {
  const normalizedProfile = decodeBestdoriProfile(payload.bestdoriProfile);
  normalizedProfile.cards = cards;
  return {
    ...payload,
    bestdoriProfile: encodeBestdoriProfile(normalizedProfile),
  };
}

function buildPayloadWithItems(
  payload: UserGameProfilePayload,
  items: {
    areaItems: UserGameProfileItemRecord[];
    characterPotentials: UserGameProfilePotentialRecord[];
    characterMissionBonuses: UserGameProfileMissionBonusRecord[];
  },
): UserGameProfilePayload {
  const normalizedProfile = decodeBestdoriProfile(payload.bestdoriProfile);
  const levelsByAreaItemId = new Map<number, number>();
  items.areaItems.forEach((item) => {
    if (item.areaItemId !== null) {
      levelsByAreaItemId.set(item.areaItemId, Math.max(0, toInteger(item.level)));
    }
  });

  normalizedProfile.items = Object.fromEntries(
    Object.entries(BANDORI_AREA_ITEM_IDS_BY_GROUP).map(([key, ids]) => [
      key,
      ids.map((areaItemId) => levelsByAreaItemId.get(areaItemId) ?? null),
    ]),
  );

  return {
    ...payload,
    bestdoriProfile: encodeBestdoriProfile(normalizedProfile),
    characterPotentials: compactPotentialRecords(items.characterPotentials),
    characterMissionBonuses: compactMissionBonusRecords(items.characterMissionBonuses),
  };
}

async function updateGameProfileSection(
  webUserId: string,
  profileId: string,
  section: "cards" | "items",
  baseSectionHash: string,
  buildNextPayload: (payload: UserGameProfilePayload) => UserGameProfilePayload,
): Promise<UserGameProfileSectionUpdateResult> {
  let row = await readGameProfileRow(webUserId, profileId);
  assertManualProfile(row);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const payload = decodeGameProfilePayload(compressedFromRow(row));
    const sectionVersions = getGameProfileSectionVersions(payload);
    const currentSectionHash = section === "cards" ? sectionVersions.cardsHash : sectionVersions.itemsHash;
    if (currentSectionHash !== baseSectionHash) {
      throwSectionConflict(section);
    }

    const nextPayload = buildNextPayload(payload);
    const writtenRow = await writeManualGameProfilePayload(webUserId, profileId, nextPayload, row.payload_sha256);
    if (writtenRow) {
      return sectionUpdateResultFromRow(writtenRow, nextPayload);
    }

    row = await readGameProfileRow(webUserId, profileId);
    assertManualProfile(row);
  }

  throwSectionConflict(section);
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
    throw new ApiRouteError(500, "GAME_PROFILES_READ_FAILED", "读取游戏档案失败", error.message);
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
    throw new ApiRouteError(400, "MANUAL_GAME_PROFILE_CREATE_FAILED", "创建手动档案失败", error.message);
  }

  return toProfileSummary(data as UserGameProfileRow);
}

export async function importManualGameProfile(webUserId: string, rawProfile: unknown): Promise<UserGameProfileSummary> {
  const bestdoriProfile = parseBestdoriProfile(rawProfile);
  const payload = importBestdoriGameProfilePayload(bestdoriProfile);
  const normalizedProfile = decodeBestdoriProfile(payload.bestdoriProfile);
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
    throw new ApiRouteError(400, "MANUAL_GAME_PROFILE_IMPORT_FAILED", "导入 Bestdori 档案失败", error.message);
  }

  return toProfileSummary(data as UserGameProfileRow);
}

export async function uploadManualGameProfilePayload(
  webUserId: string,
  name: unknown,
  compressed: CompressedGameProfilePayload,
  options: {
    localProfileId?: unknown;
    cloudProfileId?: unknown;
  } = {},
): Promise<UserGameProfileSummary> {
  const payload = decodeGameProfilePayload(compressed);
  const profileName = normalizeProfileName(name || payload.bestdoriProfile.name || "手动档案");
  payload.bestdoriProfile.name = profileName;
  const nextCompressed = encodeGameProfilePayload(payload);
  const localProfileId = normalizeLocalProfileId(options.localProfileId);
  const cloudProfileId = options.cloudProfileId ? normalizeProfileId(options.cloudProfileId) : null;
  const serviceClient = createServerSupabaseClient();

  let existing: UserGameProfileRow | null = null;
  if (cloudProfileId) {
    const cloudRow = await readGameProfileRow(webUserId, cloudProfileId);
    if (cloudRow.profile_kind !== "manual") {
      throw new ApiRouteError(403, "GAME_PROFILE_NOT_EDITABLE", "自动同步档案不允许编辑");
    }
    existing = cloudRow;
  } else if (localProfileId) {
    const { data: matchedRow, error: matchError } = await serviceClient
      .from(USER_GAME_PROFILES_TABLE)
      .select("id, profile_kind, profile_name, server, source_game_uid, storage_codec, payload_compressed, payload_sha256, payload_size, card_count, summary, synced_at, updated_at")
      .eq("web_user_id", webUserId)
      .eq("profile_kind", "manual")
      .contains("summary", { localProfileId })
      .maybeSingle();

    if (matchError) {
      throw new ApiRouteError(500, "GAME_PROFILE_READ_FAILED", "读取游戏档案失败", matchError.message);
    }
    existing = matchedRow as UserGameProfileRow | null;
  }

  if (existing) {
    const previousSummary = isRecord(existing.summary) ? existing.summary : {};
    const { data, error } = await serviceClient
      .from(USER_GAME_PROFILES_TABLE)
      .update({
        profile_name: profileName,
        server: payload.bestdoriProfile.server,
        storage_codec: nextCompressed.storageCodec,
        payload_compressed: nextCompressed.payloadCompressed,
        payload_sha256: nextCompressed.payloadSha256,
        payload_size: nextCompressed.payloadSize,
        card_count: getGameProfileCardCount(payload),
        summary: localProfileId ? { ...previousSummary, localProfileId } : previousSummary,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("web_user_id", webUserId)
      .select("id, profile_kind, profile_name, server, source_game_uid, storage_codec, payload_compressed, payload_sha256, payload_size, card_count, summary, synced_at, updated_at")
      .maybeSingle();

    if (error) {
      throw new ApiRouteError(500, "MANUAL_GAME_PROFILE_UPLOAD_FAILED", "上传手动档案失败", error.message);
    }
    if (!data) {
      throw new ApiRouteError(404, "GAME_PROFILE_NOT_FOUND", "档案不存在");
    }

    return toProfileSummary(data as UserGameProfileRow);
  }

  const { data, error } = await serviceClient.rpc("create_manual_game_profile", {
    p_web_user_id: webUserId,
    p_profile_name: profileName,
    p_payload_compressed: nextCompressed.payloadCompressed,
    p_payload_sha256: nextCompressed.payloadSha256,
    p_payload_size: nextCompressed.payloadSize,
    p_card_count: getGameProfileCardCount(payload),
    p_summary: localProfileId ? { localProfileId } : {},
  });

  if (error) {
    throw new ApiRouteError(400, "MANUAL_GAME_PROFILE_UPLOAD_FAILED", "上传手动档案失败", error.message);
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
    throw new ApiRouteError(400, "GAME_PROFILE_COPY_FAILED", "复制档案失败", error.message);
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
  assertUsableSnapshot(gameUid, snapshot, normalizedProfile);
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
    p_summary: {},
  });

  if (error) {
    throw new ApiRouteError(400, "AUTO_GAME_PROFILE_SYNC_FAILED", "保存自动档案失败", error.message);
  }

  return readGameProfileSummary(webUserId, (data as UserGameProfileRow).id);
}

export async function readCompressedGameProfilePayload(webUserId: string, profileId: string): Promise<CompressedGameProfilePayload> {
  return compressedFromRow(await readGameProfileRow(webUserId, profileId));
}

export async function readGameProfilePayloadResponse(webUserId: string, profileId: string): Promise<UserGameProfilePayloadResponse> {
  return payloadResponseFromRow(await readGameProfileRow(webUserId, profileId));
}

export async function readGameProfilePayload(webUserId: string, profileId: string): Promise<UserGameProfilePayload> {
  return decodeGameProfilePayload(await readCompressedGameProfilePayload(webUserId, profileId));
}

export async function updateGameProfilePayload(
  webUserId: string,
  profileId: string,
  payload: UserGameProfilePayload,
  basePayloadSha256: unknown,
): Promise<UserGameProfileSummary> {
  const expectedPayloadSha256 = normalizeSectionHash(basePayloadSha256, "payload");
  const existing = await readGameProfileRow(webUserId, profileId);
  assertManualProfile(existing);
  if (existing.payload_sha256.toLowerCase() !== expectedPayloadSha256) {
    throwSectionConflict("payload");
  }

  const writtenRow = await writeManualGameProfilePayload(webUserId, profileId, payload, expectedPayloadSha256);
  if (!writtenRow) {
    throwSectionConflict("payload");
  }

  return toProfileSummary({
    ...existing,
    ...writtenRow,
  });
}

export async function updateGameProfileCards(
  webUserId: string,
  profileId: string,
  baseCardsHash: unknown,
  cards: unknown,
): Promise<UserGameProfileSectionUpdateResult> {
  const normalizedHash = normalizeSectionHash(baseCardsHash, "cards");
  const normalizedCards = normalizeCardRows(cards);
  return updateGameProfileSection(
    webUserId,
    profileId,
    "cards",
    normalizedHash,
    (payload) => buildPayloadWithCards(payload, normalizedCards),
  );
}

export async function updateGameProfileItems(
  webUserId: string,
  profileId: string,
  baseItemsHash: unknown,
  body: {
    areaItems?: unknown;
    characterPotentials?: unknown;
    characterMissionBonuses?: unknown;
  },
): Promise<UserGameProfileSectionUpdateResult> {
  const normalizedHash = normalizeSectionHash(baseItemsHash, "items");
  const items = {
    areaItems: normalizeAreaItemRows(body.areaItems),
    characterPotentials: normalizePotentialRows(body.characterPotentials),
    characterMissionBonuses: normalizeMissionBonusRows(body.characterMissionBonuses),
  };
  return updateGameProfileSection(
    webUserId,
    profileId,
    "items",
    normalizedHash,
    (payload) => buildPayloadWithItems(payload, items),
  );
}

export async function exportBestdoriGameProfile(webUserId: string, profileId: string): Promise<BestdoriProfile> {
  return readGameProfilePayload(webUserId, profileId).then(exportBestdoriGameProfilePayload);
}

export async function deleteGameProfile(webUserId: string, profileId: string): Promise<void> {
  const serviceClient = createServerSupabaseClient();
  const { error } = await serviceClient
    .from(USER_GAME_PROFILES_TABLE)
    .delete()
    .eq("id", profileId)
    .eq("web_user_id", webUserId);

  if (error) {
    throw new ApiRouteError(500, "GAME_PROFILE_DELETE_FAILED", "删除档案失败", error.message);
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
