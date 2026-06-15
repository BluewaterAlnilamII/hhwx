"use client";

import dynamic from "next/dynamic";
import { type RefObject } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { type BandoriAssetRegion } from "@/lib/bandori-asset-proxy";
import { type BandoriCharacterBonusState } from "@/lib/bandori-team-calculator";
import { type GameProfileCardMetadata } from "@/lib/bandori-game-profile-card";
import { type UserGameProfileCardRecord } from "@/lib/user-game-profile-payload";
import { type BandoriCardPickerProps } from "@/components/bandori/card-picker/BandoriCardPicker";
import { type BandoriCardPickerValue } from "@/components/bandori/card-picker/types";
import { type GameProfileCardEditorDialogProps } from "@/components/bandori/GameProfileCardEditorDialog";
import { type TemporaryGameProfileCard } from "./card-preferences";

function TemporaryCardPickerLoading() {
  const t = useTranslations("bandori.teamBuilder.dynamicLoading");
  return (
    <div className="flex min-h-[18rem] items-center justify-center gap-2 rounded-xl bg-white p-4 text-sm font-bold text-slate-600">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {t("cardPicker")}
    </div>
  );
}

function TemporaryCardEditorLoading() {
  const t = useTranslations("bandori.teamBuilder.dynamicLoading");
  return (
    <div className="fixed inset-0 z-[1100] flex h-dvh items-center justify-center overflow-hidden overscroll-contain bg-slate-950/55 p-3 sm:p-6" role="dialog" aria-modal="true">
      <div className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-600 shadow-2xl">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t("cardEditor")}
      </div>
    </div>
  );
}

const DynamicBandoriCardPicker = dynamic<BandoriCardPickerProps>(
  () => import("@/components/bandori/card-picker/BandoriCardPicker"),
  {
    ssr: false,
    loading: TemporaryCardPickerLoading,
  },
);

const DynamicGameProfileCardEditorDialog = dynamic<GameProfileCardEditorDialogProps>(
  () => import("@/components/bandori/GameProfileCardEditorDialog"),
  {
    ssr: false,
    loading: TemporaryCardEditorLoading,
  },
);

export type TemporaryCardPickerDialogProps = {
  open: boolean;
  value: BandoriCardPickerValue | null;
  adding: boolean;
  region: BandoriAssetRegion;
  scrollElementRef: RefObject<HTMLDivElement | null>;
  onValueChange: (value: BandoriCardPickerValue | null) => void;
  onClose: () => void;
};

export type TemporaryCardEditorDialogProps = {
  card: TemporaryGameProfileCard;
  baselineCard: TemporaryGameProfileCard | null;
  metadata: GameProfileCardMetadata | undefined;
  characterName: string;
  bandId: number | null;
  characterBonusesById: Record<string, BandoriCharacterBonusState | undefined>;
  region: BandoriAssetRegion;
  exists: boolean;
  onClose: () => void;
  onSave: (card: UserGameProfileCardRecord) => void;
  onDelete: () => void;
};

export function TemporaryCardPickerDialog({
  open,
  value,
  adding,
  region,
  scrollElementRef,
  onValueChange,
  onClose,
}: TemporaryCardPickerDialogProps) {
  const t = useTranslations("bandori.teamBuilder.temporaryCards");
  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal((
    <div className="fixed inset-0 z-[1000] flex h-dvh items-center justify-center overflow-hidden overscroll-contain bg-slate-950/55 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="temporary-card-picker-title">
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-slate-50 shadow-2xl sm:max-h-[calc(100dvh-3rem)]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id="temporary-card-picker-title" className="text-lg font-bold text-slate-900">{t("pickerTitle")}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
            title={t("close")}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div ref={scrollElementRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
          <DynamicBandoriCardPicker
            value={value}
            onValueChange={onValueChange}
            region={region}
            showArtToggle={false}
            scrollElementRef={scrollElementRef}
          />
          {adding ? (
            <div className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-white p-3 text-sm font-bold text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {t("preparing")}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  ), document.body);
}

export function TemporaryCardEditorDialog({
  card,
  baselineCard,
  metadata,
  characterName,
  bandId,
  characterBonusesById,
  region,
  exists,
  onClose,
  onSave,
  onDelete,
}: TemporaryCardEditorDialogProps) {
  const t = useTranslations("bandori.teamBuilder.temporaryCards");
  return (
    <DynamicGameProfileCardEditorDialog
      card={card}
      baselineCard={baselineCard}
      metadata={metadata}
      characterName={characterName}
      bandId={bandId}
      characterBonusesById={characterBonusesById}
      region={region}
      saving={false}
      title={t("editorTitle")}
      saveLabel={exists ? t("save") : t("add")}
      deleteLabel={t("delete")}
      showDeleteButton={exists}
      showTrainedArtControl={false}
      allowSaveWithoutChanges={!exists}
      onClose={onClose}
      onSave={onSave}
      onDelete={onDelete}
    />
  );
}
