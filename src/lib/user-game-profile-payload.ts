import {
  decodeBestdoriCardIds,
  decodeBestdoriProfile,
  decodeRunLengthPairs,
  encodeBestdoriCardIds,
  encodeBestdoriProfile,
  encodeRunLengthPairs,
  type BestdoriProfile,
} from "@/lib/bestdori-profile-codec";
import {
  BANDORI_AREA_ITEM_IDS_BY_GROUP,
  orderBandoriAreaItems,
} from "@/lib/bandori-area-item-groups";
import { compareBandoriCharacterIds } from "@/lib/bandori-character-groups";

export const USER_GAME_PROFILE_STORAGE_CODEC = "hhwx-profile+gzip+base64-v1";
export const HHWX_BESTDORI_PROFILE_FORMAT = "hhwx-profile-v1";

export type UserGameProfileCardRecord = {
  cardId: number;
  level: number;
  masterRank: number;
  skillLevel: number;
  episodeCount: number;
  isTrained: boolean;
  hasTrainedArt: boolean;
  isExcluded: boolean;
};

export type UserGameProfileItemRecord = {
  itemKey: string;
  areaItemId: number | null;
  itemCount: number;
  level: number;
};

export type UserGameProfilePotentialRecord = {
  characterId: number;
  performanceLevel: number | null;
  techniqueLevel: number | null;
  visualLevel: number | null;
};

export type UserGameProfileMissionBonusRecord = {
  characterId: number;
  bonusType: string;
  performance: number;
  technique: number;
  visual: number;
};

export type CompactGameProfilePotentialRecords = {
  ids: string;
  performance: unknown[];
  technique: unknown[];
  visual: unknown[];
};

export type CompactGameProfileMissionBonusRecords = {
  ids: string;
  collection: {
    performance: unknown[];
    technique: unknown[];
    visual: unknown[];
  };
  training: {
    performance: unknown[];
    technique: unknown[];
    visual: unknown[];
  };
};

export type UserGameProfilePayload = {
  bestdoriProfile: BestdoriProfile;
  characterPotentials?: CompactGameProfilePotentialRecords;
  characterMissionBonuses?: CompactGameProfileMissionBonusRecords;
  source?: {
    gameUid?: string;
    syncedAt?: string;
  };
};

export type HhwxBestdoriProfileExtension = {
  format: typeof HHWX_BESTDORI_PROFILE_FORMAT;
  characterPotentials?: CompactGameProfilePotentialRecords;
  characterMissionBonuses?: CompactGameProfileMissionBonusRecords;
};

export type CompressedGameProfilePayload = {
  storageCodec: typeof USER_GAME_PROFILE_STORAGE_CODEC;
  payloadCompressed: string;
  payloadSha256: string;
  payloadSize: number;
};

const MAX_BANDORI_CHARACTER_ID = 50;

function toFiniteNumber(value: unknown, fallback = 0): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeBestdoriImportAreaItemLevel(level: number | null): number | null {
  if (level === null) {
    return 0;
  }

  return Math.max(0, Math.trunc(toFiniteNumber(level)) + 1);
}

function getHhwxBestdoriProfileExtension(profile: BestdoriProfile): HhwxBestdoriProfileExtension | null {
  if (!isRecord(profile.hhwx) || profile.hhwx.format !== HHWX_BESTDORI_PROFILE_FORMAT) {
    return null;
  }

  return {
    format: HHWX_BESTDORI_PROFILE_FORMAT,
    characterPotentials: isRecord(profile.hhwx.characterPotentials)
      ? profile.hhwx.characterPotentials as CompactGameProfilePotentialRecords
      : undefined,
    characterMissionBonuses: isRecord(profile.hhwx.characterMissionBonuses)
      ? profile.hhwx.characterMissionBonuses as CompactGameProfileMissionBonusRecords
      : undefined,
  };
}

export function getGameProfileCards(payload: UserGameProfilePayload): UserGameProfileCardRecord[] {
  return decodeBestdoriProfile(payload.bestdoriProfile).cards;
}

export function getGameProfileAreaItems(payload: UserGameProfilePayload): UserGameProfileItemRecord[] {
  const normalizedProfile = decodeBestdoriProfile(payload.bestdoriProfile);
  return Object.entries(orderBandoriAreaItems(normalizedProfile.items)).flatMap(([itemKey, levels]) => {
    const areaItemIds = BANDORI_AREA_ITEM_IDS_BY_GROUP[itemKey] ?? [];
    return levels.map((level, index) => ({
      itemKey: `${itemKey}:${index}`,
      areaItemId: areaItemIds[index] ?? null,
      itemCount: 1,
      level: level ?? 0,
    }));
  }).filter((item) => item.areaItemId !== null);
}

export function getGameProfileCharacterPotentials(payload: UserGameProfilePayload): UserGameProfilePotentialRecord[] {
  if (payload.characterPotentials) {
    return decodeCompactPotentialRecords(payload.characterPotentials);
  }

  return [];
}

export function getGameProfileCharacterMissionBonuses(payload: UserGameProfilePayload): UserGameProfileMissionBonusRecord[] {
  if (payload.characterMissionBonuses) {
    return decodeCompactMissionBonusRecords(payload.characterMissionBonuses);
  }

  return [];
}

export function getGameProfileCardCount(payload: UserGameProfilePayload): number {
  return getGameProfileCards(payload).length;
}

function normalizePotentialExportValue(value: number): number {
  const normalizedValue = Math.max(0, toFiniteNumber(value));
  return normalizedValue === 1 ? 0 : normalizedValue;
}

function normalizeAreaItemExportLevel(level: number | null): number | null {
  if (level === null) {
    return null;
  }

  const normalizedLevel = Math.max(0, Math.trunc(toFiniteNumber(level)));
  return normalizedLevel > 0 ? normalizedLevel - 1 : null;
}

function distributeBestdoriPotentialTotal(total: number): {
  potential: number;
  training: number;
  collection: number;
} {
  const normalizedTotal = Math.max(0, Math.trunc(toFiniteNumber(total)));
  const effectiveTotal = normalizedTotal <= 1 ? 0 : normalizedTotal;
  const potential = Math.min(effectiveTotal, 50);
  const training = Math.min(Math.max(effectiveTotal - 50, 0), 20);
  const collection = Math.min(Math.max(effectiveTotal - 70, 0), 40);

  return { potential, training, collection };
}

function importPotentialRecordsFromBestdoriTotals(potentials: number[]): UserGameProfilePotentialRecord[] {
  return potentials.flatMap((total, index) => {
    const characterId = index + 1;
    if (characterId > MAX_BANDORI_CHARACTER_ID) {
      return [];
    }

    const distributed = distributeBestdoriPotentialTotal(total);
    return {
      characterId,
      performanceLevel: distributed.potential,
      techniqueLevel: distributed.potential,
      visualLevel: distributed.potential,
    };
  });
}

function importMissionBonusRecordsFromBestdoriTotals(potentials: number[]): UserGameProfileMissionBonusRecord[] {
  return potentials.flatMap((total, index) => {
    const characterId = index + 1;
    if (characterId > MAX_BANDORI_CHARACTER_ID) {
      return [];
    }

    const distributed = distributeBestdoriPotentialTotal(total);
    return [
      {
        characterId,
        bonusType: "TRAINING",
        performance: distributed.training,
        technique: distributed.training,
        visual: distributed.training,
      },
      {
        characterId,
        bonusType: "COLLECTION",
        performance: distributed.collection,
        technique: distributed.collection,
        visual: distributed.collection,
      },
    ];
  });
}

export function importBestdoriGameProfilePayload(bestdoriProfile: BestdoriProfile): UserGameProfilePayload {
  const normalizedProfile = decodeBestdoriProfile(bestdoriProfile);
  if (bestdoriProfile.data.cards.ids.trim() && normalizedProfile.cards.length === 0) {
    throw new Error("Bestdori 档案卡牌数据解析为空，已取消导入以避免创建空档案");
  }

  const bestdoriPotentials = normalizedProfile.potentials;
  // Public profile JSON always uses Bestdori's area-item level encoding.
  // The HHWX extension only restores fields that Bestdori does not model.
  normalizedProfile.items = Object.fromEntries(
    Object.entries(normalizedProfile.items).map(([itemKey, levels]) => [
      itemKey,
      levels.map(normalizeBestdoriImportAreaItemLevel),
    ]),
  );
  normalizedProfile.potentials = [];

  const extension = getHhwxBestdoriProfileExtension(bestdoriProfile);
  return {
    bestdoriProfile: encodeBestdoriProfile(normalizedProfile),
    characterPotentials: compactPotentialRecords(
      extension?.characterPotentials ?? importPotentialRecordsFromBestdoriTotals(bestdoriPotentials),
    ),
    characterMissionBonuses: compactMissionBonusRecords(
      extension?.characterMissionBonuses ?? importMissionBonusRecordsFromBestdoriTotals(bestdoriPotentials),
    ),
  };
}

export function exportBestdoriGameProfilePayload(payload: UserGameProfilePayload): BestdoriProfile {
  const compactPayload = compactGameProfilePayload(payload);
  const normalizedProfile = decodeBestdoriProfile(compactPayload.bestdoriProfile);
  normalizedProfile.items = Object.fromEntries(
    Object.entries(normalizedProfile.items).map(([itemKey, levels]) => [
      itemKey,
      levels.map(normalizeAreaItemExportLevel),
    ]),
  );

  const potentials = getGameProfileCharacterPotentials(compactPayload);
  const missionBonuses = getGameProfileCharacterMissionBonuses(compactPayload);
  const missionBonusByCharacter = new Map<number, { performance: number; technique: number; visual: number }>();

  missionBonuses.forEach((bonus) => {
    const current = missionBonusByCharacter.get(bonus.characterId) ?? { performance: 0, technique: 0, visual: 0 };
    current.performance += Math.max(0, toFiniteNumber(bonus.performance));
    current.technique += Math.max(0, toFiniteNumber(bonus.technique));
    current.visual += Math.max(0, toFiniteNumber(bonus.visual));
    missionBonusByCharacter.set(bonus.characterId, current);
  });

  const potentialByCharacter = new Map(potentials.map((potential) => [potential.characterId, potential]));
  const characterCount = Math.min(
    MAX_BANDORI_CHARACTER_ID,
    Math.max(0, ...potentialByCharacter.keys(), ...missionBonusByCharacter.keys()),
  );
  normalizedProfile.potentials = Array.from({ length: characterCount }, (_, index) => {
    const characterId = index + 1;
    const potential = potentialByCharacter.get(characterId);
    const missionBonus = missionBonusByCharacter.get(characterId) ?? { performance: 0, technique: 0, visual: 0 };
    const performancePotential = normalizePotentialExportValue(potential?.performanceLevel ?? 0);
    const techniquePotential = normalizePotentialExportValue(potential?.techniqueLevel ?? 0);
    const visualPotential = normalizePotentialExportValue(potential?.visualLevel ?? 0);
    const total = Math.round((
      performancePotential + missionBonus.performance
      + techniquePotential + missionBonus.technique
      + visualPotential + missionBonus.visual
    ) / 3);

    return total > 0 ? total : 1;
  });

  const exportedProfile = encodeBestdoriProfile(normalizedProfile);
  exportedProfile.hhwx = {
    format: HHWX_BESTDORI_PROFILE_FORMAT,
    characterPotentials: compactPayload.characterPotentials,
    characterMissionBonuses: compactPayload.characterMissionBonuses,
  } satisfies HhwxBestdoriProfileExtension;
  return exportedProfile;
}

export function compactPotentialRecords(records?: UserGameProfilePotentialRecord[] | CompactGameProfilePotentialRecords): CompactGameProfilePotentialRecords | undefined {
  if (!records) {
    return undefined;
  }
  if (!Array.isArray(records)) {
    return records;
  }

  const sortedRecords = [...records]
    .filter((record) => record.characterId > 0 && record.characterId <= MAX_BANDORI_CHARACTER_ID)
    .sort((left, right) => compareBandoriCharacterIds(left.characterId, right.characterId));
  return {
    ids: encodeBestdoriCardIds(sortedRecords.map((record) => record.characterId)),
    performance: encodeRunLengthPairs(sortedRecords.map((record) => record.performanceLevel)),
    technique: encodeRunLengthPairs(sortedRecords.map((record) => record.techniqueLevel)),
    visual: encodeRunLengthPairs(sortedRecords.map((record) => record.visualLevel)),
  };
}

function decodeCompactPotentialRecords(records: CompactGameProfilePotentialRecords): UserGameProfilePotentialRecord[] {
  const characterIds = decodeBestdoriCardIds(records.ids);
  const expectedLength = characterIds.length;
  const performance = decodeRunLengthPairs<number | null>(records.performance, expectedLength);
  const technique = decodeRunLengthPairs<number | null>(records.technique, expectedLength);
  const visual = decodeRunLengthPairs<number | null>(records.visual, expectedLength);
  return characterIds.map((characterId, index) => ({
    characterId,
    performanceLevel: performance[index] === null ? null : Math.max(0, toFiniteNumber(performance[index])),
    techniqueLevel: technique[index] === null ? null : Math.max(0, toFiniteNumber(technique[index])),
    visualLevel: visual[index] === null ? null : Math.max(0, toFiniteNumber(visual[index])),
  }))
    .filter((record) => record.characterId > 0 && record.characterId <= MAX_BANDORI_CHARACTER_ID)
    .sort((left, right) => compareBandoriCharacterIds(left.characterId, right.characterId));
}

export function compactMissionBonusRecords(records?: UserGameProfileMissionBonusRecord[] | CompactGameProfileMissionBonusRecords): CompactGameProfileMissionBonusRecords | undefined {
  if (!records) {
    return undefined;
  }
  if (!Array.isArray(records)) {
    return records;
  }

  const valuesByCharacter = new Map<number, Record<"collection" | "training", { performance: number; technique: number; visual: number }>>();
  records
    .filter((record) => record.characterId > 0 && record.characterId <= MAX_BANDORI_CHARACTER_ID)
    .forEach((record) => {
      const bonusType = record.bonusType.toUpperCase() === "TRAINING" ? "training" : "collection";
      const current = valuesByCharacter.get(record.characterId) ?? {
        collection: { performance: 0, technique: 0, visual: 0 },
        training: { performance: 0, technique: 0, visual: 0 },
      };
      current[bonusType] = {
        performance: record.performance,
        technique: record.technique,
        visual: record.visual,
      };
      valuesByCharacter.set(record.characterId, current);
    });
  const sortedRecords = [...valuesByCharacter.entries()].sort(([left], [right]) => compareBandoriCharacterIds(left, right));

  return {
    ids: encodeBestdoriCardIds(sortedRecords.map(([characterId]) => characterId)),
    collection: {
      performance: encodeRunLengthPairs(sortedRecords.map(([, record]) => record.collection.performance)),
      technique: encodeRunLengthPairs(sortedRecords.map(([, record]) => record.collection.technique)),
      visual: encodeRunLengthPairs(sortedRecords.map(([, record]) => record.collection.visual)),
    },
    training: {
      performance: encodeRunLengthPairs(sortedRecords.map(([, record]) => record.training.performance)),
      technique: encodeRunLengthPairs(sortedRecords.map(([, record]) => record.training.technique)),
      visual: encodeRunLengthPairs(sortedRecords.map(([, record]) => record.training.visual)),
    },
  };
}

function decodeCompactMissionBonusRecords(records: CompactGameProfileMissionBonusRecords): UserGameProfileMissionBonusRecord[] {
  const characterIds = decodeBestdoriCardIds(records.ids);
  const expectedLength = characterIds.length;
  const collectionPerformance = decodeRunLengthPairs<number>(records.collection.performance, expectedLength);
  const collectionTechnique = decodeRunLengthPairs<number>(records.collection.technique, expectedLength);
  const collectionVisual = decodeRunLengthPairs<number>(records.collection.visual, expectedLength);
  const trainingPerformance = decodeRunLengthPairs<number>(records.training.performance, expectedLength);
  const trainingTechnique = decodeRunLengthPairs<number>(records.training.technique, expectedLength);
  const trainingVisual = decodeRunLengthPairs<number>(records.training.visual, expectedLength);
  return characterIds.flatMap((characterId, index) => {
    if (characterId <= 0 || characterId > MAX_BANDORI_CHARACTER_ID) {
      return [];
    }

    return [
      {
        characterId,
        bonusType: "COLLECTION",
        performance: Math.max(0, toFiniteNumber(collectionPerformance[index])),
        technique: Math.max(0, toFiniteNumber(collectionTechnique[index])),
        visual: Math.max(0, toFiniteNumber(collectionVisual[index])),
      },
      {
        characterId,
        bonusType: "TRAINING",
        performance: Math.max(0, toFiniteNumber(trainingPerformance[index])),
        technique: Math.max(0, toFiniteNumber(trainingTechnique[index])),
        visual: Math.max(0, toFiniteNumber(trainingVisual[index])),
      },
    ];
  }).sort((left, right) => compareBandoriCharacterIds(left.characterId, right.characterId) || (left.bonusType === "TRAINING" ? -1 : 1));
}

export function compactGameProfilePayload(payload: UserGameProfilePayload): UserGameProfilePayload {
  const normalizedProfile = decodeBestdoriProfile(payload.bestdoriProfile);
  normalizedProfile.items = orderBandoriAreaItems(normalizedProfile.items);
  normalizedProfile.potentials = [];

  return {
    bestdoriProfile: encodeBestdoriProfile(normalizedProfile),
    characterPotentials: compactPotentialRecords(payload.characterPotentials),
    characterMissionBonuses: compactMissionBonusRecords(payload.characterMissionBonuses),
    source: payload.source,
  };
}

function decodeBase64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeBytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

async function decompressGzip(bytes: Uint8Array): Promise<string> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("当前浏览器不支持 gzip 解压");
  }

  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const stream = new Blob([arrayBuffer]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

async function compressGzip(value: string): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") {
    throw new Error("当前浏览器不支持 gzip 压缩");
  }

  const stream = new Blob([value]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function encodeCompressedGameProfilePayload(payload: UserGameProfilePayload): Promise<CompressedGameProfilePayload> {
  const json = JSON.stringify(compactGameProfilePayload(payload));
  return {
    storageCodec: USER_GAME_PROFILE_STORAGE_CODEC,
    payloadCompressed: encodeBytesToBase64(await compressGzip(json)),
    payloadSha256: await sha256Hex(json),
    payloadSize: new TextEncoder().encode(json).length,
  };
}

export async function decodeCompressedGameProfilePayload(
  compressed: CompressedGameProfilePayload,
): Promise<UserGameProfilePayload> {
  if (compressed.storageCodec !== USER_GAME_PROFILE_STORAGE_CODEC) {
    throw new Error(`不支持的 Profile 存储格式: ${compressed.storageCodec}`);
  }

  const json = await decompressGzip(decodeBase64ToBytes(compressed.payloadCompressed));
  const payload = JSON.parse(json) as UserGameProfilePayload;
  if (!payload.bestdoriProfile) {
    throw new Error("Profile payload 格式无效");
  }
  return payload;
}
