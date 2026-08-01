import { type AppLocale } from "@/i18n/routing";
import { hasTrainedCardArt } from "@/lib/bandori-card-training";
import { pickBestdoriLocalizedName } from "@/lib/bestdori-regional-names";
import {
  DEFAULT_BANDORI_PREFERRED_SERVER,
  type BandoriServer,
} from "@/lib/bandori-server";
import { type UserGameProfileCardRecord } from "@/lib/user-game-profile-payload";

export type GameProfileCardAttribute = "powerful" | "pure" | "cool" | "happy";

export type GameProfileCardMetadata = {
  characterId?: number;
  rarity?: number;
  attribute?: GameProfileCardAttribute | string;
  levelLimit?: number;
  resourceSetName?: string;
  prefix?: Array<string | null>;
  releasedAt?: Array<string | number | null>;
  type?: string;
  displayName?: string | null;
  hasTrainedArt?: boolean;
  stat?: {
    training?: {
      levelLimit?: number;
    };
  } & Record<string, unknown>;
};

export function pickGameProfileCardName(
  cardId: number,
  metadata?: GameProfileCardMetadata,
  preferredServer: BandoriServer = DEFAULT_BANDORI_PREFERRED_SERVER,
  locale: AppLocale = "zh-CN",
  contextServer?: BandoriServer | null,
): string {
  const localizedName = pickBestdoriLocalizedName(metadata?.prefix, preferredServer, contextServer);
  const fallbackName = locale === "en" ? `Card ${cardId}` : `\u5361\u724c ${cardId}`;
  return localizedName ?? metadata?.displayName ?? fallbackName;
}

export function getGameProfileCardLevelLimit(
  card: UserGameProfileCardRecord,
  metadata?: GameProfileCardMetadata,
): number {
  const baseLevelLimit = Math.max(1, Math.trunc(Number(metadata?.levelLimit) || card.level || 60));
  const trainingLevelLimit = Math.max(0, Math.trunc(Number(metadata?.stat?.training?.levelLimit) || 0));
  const trainedLimit = card.isTrained ? baseLevelLimit + trainingLevelLimit : baseLevelLimit;
  return Math.max(trainedLimit, card.level, 1);
}

export function createMaxGameProfileCard(
  cardId: number,
  metadata?: GameProfileCardMetadata,
): UserGameProfileCardRecord {
  const hasTraining = metadata?.hasTrainedArt ?? hasTrainedCardArt(metadata);
  const card: UserGameProfileCardRecord = {
    cardId,
    level: 1,
    masterRank: 4,
    skillLevel: 5,
    episodeCount: 2,
    isTrained: hasTraining,
    hasTrainedArt: hasTraining,
    isExcluded: false,
  };

  return {
    ...card,
    level: getGameProfileCardLevelLimit(card, metadata),
  };
}

export function hasGameProfileCardChanged(
  left: UserGameProfileCardRecord,
  right: UserGameProfileCardRecord,
): boolean {
  return JSON.stringify(left) !== JSON.stringify(right);
}
