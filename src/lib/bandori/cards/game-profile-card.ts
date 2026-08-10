import { type AppLocale } from "@/i18n/routing";
import { type BandoriCardMasterRecord } from "@/lib/bandori/cards/api-client";
import { hasTrainedCardArt } from "@/lib/bandori/cards/training";
import { pickBestdoriLocalizedName } from "@/lib/bestdori-regional-names";
import {
  DEFAULT_BANDORI_PREFERRED_SERVER,
  type BandoriServer,
} from "@/lib/bandori-server";
import { type UserGameProfileCardRecord } from "@/lib/user-game-profile-payload";

export type GameProfileCardMetadata = BandoriCardMasterRecord;

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

function createGameProfileCard(
  cardId: number,
  metadata: GameProfileCardMetadata | undefined,
  values: Pick<UserGameProfileCardRecord, "masterRank" | "skillLevel">,
): UserGameProfileCardRecord {
  const hasTraining = metadata?.hasTrainedArt ?? hasTrainedCardArt(metadata);
  const card: UserGameProfileCardRecord = {
    cardId,
    level: 1,
    masterRank: values.masterRank,
    skillLevel: values.skillLevel,
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

export function createMaxGameProfileCard(
  cardId: number,
  metadata?: GameProfileCardMetadata,
): UserGameProfileCardRecord {
  return createGameProfileCard(cardId, metadata, {
    masterRank: 4,
    skillLevel: 5,
  });
}

export function createDefaultOwnedGameProfileCard(
  cardId: number,
  metadata?: GameProfileCardMetadata,
): UserGameProfileCardRecord {
  return createGameProfileCard(cardId, metadata, {
    masterRank: 0,
    skillLevel: 1,
  });
}

export function hasGameProfileCardChanged(
  left: UserGameProfileCardRecord,
  right: UserGameProfileCardRecord,
): boolean {
  return !areGameProfileCardsEqual(left, right);
}

export function areGameProfileCardsEqual(
  left: UserGameProfileCardRecord,
  right: UserGameProfileCardRecord,
): boolean {
  return left.cardId === right.cardId
    && left.level === right.level
    && left.masterRank === right.masterRank
    && left.skillLevel === right.skillLevel
    && left.episodeCount === right.episodeCount
    && left.isTrained === right.isTrained
    && left.hasTrainedArt === right.hasTrainedArt
    && left.isExcluded === right.isExcluded;
}
