"use client";

import { useTranslations } from "next-intl";
import GameProfileCardEditorDialog from "@/components/bandori/GameProfileCardEditorDialog";
import { type BandoriCardServer } from "@/lib/bandori-card-server-extensions";
import { type GameProfileCardMetadata } from "@/lib/bandori-game-profile-card";
import { type BandoriCharacterBonusState } from "@/lib/bandori-team-calculator";
import { type UserGameProfileCardRecord } from "@/lib/user-game-profile-payload";
import { type TemporaryGameProfileCard } from "./card-preferences";

export type TemporaryCardEditorDialogProps = {
  card: TemporaryGameProfileCard;
  baselineCard: TemporaryGameProfileCard | null;
  metadata: GameProfileCardMetadata | undefined;
  characterName: string;
  bandId: number | null;
  characterBonusesById: Record<string, BandoriCharacterBonusState | undefined>;
  displayServer: BandoriCardServer;
  isExistingCard: boolean;
  onClose: () => void;
  onApply: (card: UserGameProfileCardRecord) => void;
  onDelete: () => void;
};

export default function TemporaryCardEditorDialog({
  card,
  baselineCard,
  metadata,
  characterName,
  bandId,
  characterBonusesById,
  displayServer,
  isExistingCard,
  onClose,
  onApply,
  onDelete,
}: TemporaryCardEditorDialogProps) {
  const t = useTranslations("bandori.teamBuilder.temporaryCards");
  const cardPickerT = useTranslations("bandori.cardPicker");
  return (
    <GameProfileCardEditorDialog
      card={card}
      cardIdLabel={cardPickerT("cardFallback", { cardId: card.cardId })}
      baselineCard={baselineCard}
      metadata={metadata}
      characterName={characterName}
      bandId={bandId}
      characterBonusesById={characterBonusesById}
      displayServer={displayServer}
      title={t("editorTitle")}
      applyLabel={isExistingCard ? t("apply") : t("add")}
      deleteLabel={t("delete")}
      showDeleteButton={isExistingCard}
      showTrainedArtControl={false}
      canApplyWithoutChanges={!isExistingCard}
      onClose={onClose}
      onApply={onApply}
      onDelete={onDelete}
    />
  );
}
