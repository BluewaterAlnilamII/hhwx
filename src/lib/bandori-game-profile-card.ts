import { type BandoriAssetRegion } from "@/lib/bandori-asset-proxy";
import { pickBestdoriCnThenJpName } from "@/lib/bestdori-regional-names";
import { type UserGameProfileCardRecord } from "@/lib/user-game-profile-payload";

export type GameProfileCardAttribute = "powerful" | "pure" | "cool" | "happy";

export type GameProfileCardMetadata = {
  characterId?: number;
  rarity?: number;
  attribute?: GameProfileCardAttribute | string;
  levelLimit?: number;
  resourceSetName?: string;
  assetRegion?: BandoriAssetRegion;
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

export function pickGameProfileCardName(cardId: number, metadata?: GameProfileCardMetadata): string {
  return metadata?.displayName
    ?? pickBestdoriCnThenJpName(metadata?.prefix)
    ?? `卡牌 ${cardId}`;
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
  const hasTraining = metadata?.hasTrainedArt === true || Boolean(metadata?.stat?.training);
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
