import type { UserGameProfileCardRecord } from "@/lib/user-game-profile-payload";

export type TemporaryGameProfileCard = UserGameProfileCardRecord & {
  instanceId: string;
};

export type CardPreferenceRarityThreshold = 3 | 4 | 5;

export type OwnedCardParameterPreferences = {
  maxLevelEpisodeTraining: boolean;
  maxMasterRank: boolean;
  maxMasterRankRarityThreshold: CardPreferenceRarityThreshold;
  maxSkillLevel: boolean;
  maxSkillLevelRarityThreshold: CardPreferenceRarityThreshold;
};

export type TeamBuilderCardPreferences = {
  excludedCardIds: number[];
  temporaryCards: TemporaryGameProfileCard[];
  ownedCardParameters: OwnedCardParameterPreferences;
};

const TEAMBUILDER_CARD_PREFERENCES_STORAGE_KEY = "hhwx-bandori-teambuilder-card-preferences:v1";

export const DEFAULT_OWNED_CARD_PARAMETER_PREFERENCES: OwnedCardParameterPreferences = {
  maxLevelEpisodeTraining: false,
  maxMasterRank: false,
  maxMasterRankRarityThreshold: 4,
  maxSkillLevel: false,
  maxSkillLevelRarityThreshold: 3,
};

export const CARD_PARAMETER_RARITY_THRESHOLD_OPTIONS: CardPreferenceRarityThreshold[] = [3, 4, 5];

export function createDefaultCardPreferences(): TeamBuilderCardPreferences {
  return {
    excludedCardIds: [],
    temporaryCards: [],
    ownedCardParameters: { ...DEFAULT_OWNED_CARD_PARAMETER_PREFERENCES },
  };
}

function normalizePreferenceInteger(value: unknown, min: number, max: number, fallback: number): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(numberValue)));
}

export function normalizeRarityThreshold(value: unknown, fallback: CardPreferenceRarityThreshold): CardPreferenceRarityThreshold {
  const normalized = normalizePreferenceInteger(value, 3, 5, fallback);
  return normalized === 3 || normalized === 4 || normalized === 5 ? normalized : fallback;
}

export function normalizeOwnedCardParameterPreferences(value: unknown): OwnedCardParameterPreferences {
  if (typeof value !== "object" || value === null) {
    return { ...DEFAULT_OWNED_CARD_PARAMETER_PREFERENCES };
  }
  const record = value as Partial<OwnedCardParameterPreferences>;
  return {
    maxLevelEpisodeTraining: record.maxLevelEpisodeTraining === true,
    maxMasterRank: record.maxMasterRank === true,
    maxMasterRankRarityThreshold: normalizeRarityThreshold(
      record.maxMasterRankRarityThreshold,
      DEFAULT_OWNED_CARD_PARAMETER_PREFERENCES.maxMasterRankRarityThreshold,
    ),
    maxSkillLevel: record.maxSkillLevel === true,
    maxSkillLevelRarityThreshold: normalizeRarityThreshold(
      record.maxSkillLevelRarityThreshold,
      DEFAULT_OWNED_CARD_PARAMETER_PREFERENCES.maxSkillLevelRarityThreshold,
    ),
  };
}

function normalizeTemporaryCard(value: unknown): TemporaryGameProfileCard | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Partial<TemporaryGameProfileCard>;
  const cardId = normalizePreferenceInteger(record.cardId, 1, 999999, 0);
  const instanceId = typeof record.instanceId === "string" && record.instanceId.trim()
    ? record.instanceId.trim()
    : "";
  if (!cardId || !instanceId) {
    return null;
  }
  return {
    instanceId,
    cardId,
    level: normalizePreferenceInteger(record.level, 1, 200, 1),
    masterRank: normalizePreferenceInteger(record.masterRank, 0, 4, 0),
    skillLevel: normalizePreferenceInteger(record.skillLevel, 1, 5, 1),
    episodeCount: normalizePreferenceInteger(record.episodeCount, 0, 2, 0),
    isTrained: record.isTrained === true,
    hasTrainedArt: record.hasTrainedArt === true,
    isExcluded: false,
  };
}

export function normalizeCardPreferences(value: unknown): TeamBuilderCardPreferences {
  if (typeof value !== "object" || value === null) {
    return createDefaultCardPreferences();
  }
  const record = value as Partial<TeamBuilderCardPreferences>;
  const excludedCardIds = Array.isArray(record.excludedCardIds)
    ? Array.from(new Set(record.excludedCardIds
      .map((cardId) => normalizePreferenceInteger(cardId, 1, 999999, 0))
      .filter((cardId) => cardId > 0)))
    : [];
  const temporaryCards = Array.isArray(record.temporaryCards)
    ? record.temporaryCards.flatMap((card) => {
      const normalized = normalizeTemporaryCard(card);
      return normalized ? [normalized] : [];
    })
    : [];
  return {
    excludedCardIds,
    temporaryCards,
    ownedCardParameters: normalizeOwnedCardParameterPreferences(record.ownedCardParameters),
  };
}

export function readCardPreferences(profileCacheKey: string): TeamBuilderCardPreferences {
  if (typeof window === "undefined" || !profileCacheKey) {
    return createDefaultCardPreferences();
  }
  try {
    const rawValue = window.localStorage.getItem(TEAMBUILDER_CARD_PREFERENCES_STORAGE_KEY);
    if (!rawValue) {
      return createDefaultCardPreferences();
    }
    const stored = JSON.parse(rawValue) as Record<string, unknown>;
    return normalizeCardPreferences(stored[profileCacheKey]);
  } catch {
    return createDefaultCardPreferences();
  }
}

export function writeCardPreferences(profileCacheKey: string, preferences: TeamBuilderCardPreferences): void {
  if (typeof window === "undefined" || !profileCacheKey) {
    return;
  }
  let stored: Record<string, unknown> = {};
  try {
    const rawValue = window.localStorage.getItem(TEAMBUILDER_CARD_PREFERENCES_STORAGE_KEY);
    stored = rawValue ? JSON.parse(rawValue) as Record<string, unknown> : {};
  } catch {
    stored = {};
  }
  stored[profileCacheKey] = normalizeCardPreferences(preferences);
  window.localStorage.setItem(TEAMBUILDER_CARD_PREFERENCES_STORAGE_KEY, JSON.stringify(stored));
}
