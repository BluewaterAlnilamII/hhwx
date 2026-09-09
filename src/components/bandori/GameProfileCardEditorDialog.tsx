"use client";

import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Save, Trash2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { type AppLocale } from "@/i18n/routing";
import SharedBandoriCardThumbnail from "@/components/bandori/BandoriCardThumbnail";
import { isBandoriCardAttribute, type BandoriCardAttribute } from "@/lib/bandori/cards/filter";
import { type BandoriServer } from "@/lib/bandori-server";
import {
  getGameProfileCardLevelLimit,
  getGameProfileCardMaxEpisodeCount,
  hasGameProfileCardChanged,
  pickGameProfileCardName,
  type GameProfileCardMetadata,
} from "@/lib/bandori/cards/game-profile-card";
import { hasTrainedCardArt } from "@/lib/bandori/cards/training";
import { useBandoriPreferredServer } from "@/store/useBandoriPreferencesStore";
import {
  calculateBandoriCard,
  type BandoriCharacterBonusState,
  type BestdoriCardMaster,
} from "@/lib/bandori-team-calculator";
import { type UserGameProfileCardRecord } from "@/lib/user-game-profile-payload";
import { cn } from "@/lib/utils";

type EditableCardField = keyof Pick<
  UserGameProfileCardRecord,
  "level" | "masterRank" | "skillLevel" | "episodeCount" | "isTrained" | "hasTrainedArt"
>;

const ATTRIBUTE_LABELS: Record<BandoriCardAttribute, string> = {
  powerful: "Powerful",
  pure: "Pure",
  cool: "Cool",
  happy: "Happy",
};

const ATTRIBUTE_CLASSES: Record<BandoriCardAttribute, string> = {
  powerful: "border-rose-300 bg-rose-50 text-rose-600",
  pure: "border-emerald-300 bg-emerald-50 text-emerald-600",
  cool: "border-sky-300 bg-sky-50 text-sky-600",
  happy: "border-orange-300 bg-orange-50 text-orange-600",
};

function clampInteger(value: number, min: number, max: number): number {
  const normalizedValue = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.min(max, Math.max(min, normalizedValue));
}

function SegmentedControl<T extends string | number | boolean>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[128px_minmax(0,1fr)] sm:items-center sm:gap-2">
      <div className="text-sm font-semibold text-[var(--theme-color-text-muted)] sm:text-right">{label}</div>
      <div className="inline-flex w-fit overflow-hidden rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] shadow-xs" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={Object.is(option.value, value)}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-w-9 border-r border-[var(--theme-color-border-subtle)] px-3 py-1.5 text-sm font-semibold text-[var(--theme-color-text-muted)] transition last:border-r-0 hover:bg-[var(--theme-color-semantic-info-background)] hover:text-[var(--theme-color-semantic-info-foreground)] sm:min-w-10 sm:px-4 sm:py-2",
              Object.is(option.value, value) && "bg-[var(--theme-color-selection-strong-background)] text-[var(--theme-color-selection-strong-foreground)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)] hover:bg-[var(--theme-color-selection-strong-background)] hover:text-[var(--theme-color-selection-strong-foreground)]",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export type GameProfileCardEditorDialogProps = {
  card: UserGameProfileCardRecord;
  cardIdLabel: string;
  baselineCard?: UserGameProfileCardRecord | null;
  metadata?: GameProfileCardMetadata;
  characterName: string;
  bandId: number | null;
  characterBonusesById?: Record<string, BandoriCharacterBonusState | undefined>;
  displayServer?: BandoriServer;
  isBusy?: boolean;
  title?: string;
  applyLabel: string;
  applyDisabledReason?: string;
  deleteLabel?: string;
  showDeleteButton?: boolean;
  showTrainedArtControl?: boolean;
  canApplyWithoutChanges?: boolean;
  onClose: () => void;
  onApply: (card: UserGameProfileCardRecord) => void;
  onDelete: () => void;
};

export default function GameProfileCardEditorDialog({
  card,
  cardIdLabel,
  baselineCard = null,
  metadata,
  characterName,
  bandId,
  characterBonusesById = {},
  displayServer,
  isBusy = false,
  title,
  applyLabel,
  applyDisabledReason,
  deleteLabel,
  showDeleteButton = true,
  showTrainedArtControl = true,
  canApplyWithoutChanges = false,
  onClose,
  onApply,
  onDelete,
}: GameProfileCardEditorDialogProps) {
  const locale = useLocale() as AppLocale;
  const preferredServer = useBandoriPreferredServer();
  const t = useTranslations("bandori.cardEditor");
  const [draft, setDraft] = useState(card);
  const effectiveTitle = title ?? t("title");
  const effectiveDeleteLabel = deleteLabel ?? t("actions.delete");
  const levelLimit = getGameProfileCardLevelLimit(draft, metadata);
  const maxEpisodeCount = getGameProfileCardMaxEpisodeCount(metadata);
  const canTrain = hasTrainedCardArt(metadata);
  const cardName = pickGameProfileCardName(
    draft.cardId,
    metadata,
    preferredServer,
    locale,
    displayServer,
  );
  const attribute = metadata?.attribute;
  const hasChanges = baselineCard ? hasGameProfileCardChanged(draft, baselineCard) : hasGameProfileCardChanged(draft, card);
  const isApplyDisabled = isBusy || (!canApplyWithoutChanges && !hasChanges);
  const hasApplyDisabledReason = !isBusy && isApplyDisabled && Boolean(applyDisabledReason);
  const totalPower = useMemo(() => {
    if (!metadata) {
      return null;
    }

    try {
      return calculateBandoriCard(
        draft,
        metadata as BestdoriCardMaster,
        metadata.characterId ? { [String(metadata.characterId)]: { bandId } } : {},
        characterBonusesById,
      ).totalPower;
    } catch {
      return null;
    }
  }, [
    bandId,
    characterBonusesById,
    draft,
    metadata,
  ]);

  function updateDraft(field: EditableCardField, value: number | boolean) {
    setDraft((currentDraft) => {
      const nextDraft = {
        ...currentDraft,
        [field]: value,
      };
      if (field === "isTrained" && value === false) {
        nextDraft.hasTrainedArt = false;
      }
      if (field === "isTrained" && value === true) {
        nextDraft.hasTrainedArt = true;
      }
      if (!canTrain) {
        nextDraft.isTrained = false;
        nextDraft.hasTrainedArt = false;
      }
      return {
        ...nextDraft,
        level: clampInteger(nextDraft.level, 1, getGameProfileCardLevelLimit(nextDraft, metadata)),
        masterRank: clampInteger(nextDraft.masterRank, 0, 4),
        skillLevel: clampInteger(nextDraft.skillLevel, 1, 5),
        episodeCount: clampInteger(nextDraft.episodeCount, 0, maxEpisodeCount),
      };
    });
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-1100 bg-[var(--theme-color-overlay-background)]" />
        <Dialog.Content className="hhwx-floating-surface fixed left-1/2 top-1/2 z-1100 flex max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border focus:outline-hidden sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100%-3rem)] sm:rounded-[28px]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] px-5 py-3 sm:px-6 sm:py-4">
          <div>
            <Dialog.Title className="text-lg font-bold text-[var(--theme-color-text-default)] sm:text-xl">{effectiveTitle}</Dialog.Title>
            <Dialog.Description className="mt-1 text-xs font-semibold text-[var(--theme-color-text-muted)]">{cardIdLabel}</Dialog.Description>
          </div>
          <button type="button" onClick={onClose} className="hhwx-control inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition" aria-label={t("actions.close")}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-5">
          <div className="grid gap-3 sm:gap-5 lg:grid-cols-[132px_minmax(0,1fr)]">
            <div className="mx-auto flex w-full max-w-[104px] flex-col items-center sm:max-w-[132px]">
              <div className="h-[104px] w-[104px] overflow-visible rounded-[5px] bg-[var(--theme-color-panel-background)] shadow-[0_2px_7px_rgba(15,23,42,0.22)] sm:h-[132px] sm:w-[132px]">
                <SharedBandoriCardThumbnail
                  card={draft}
                  metadata={metadata}
                  bandId={bandId}
                  alt={t("thumbnailAlt", { cardName })}
                  size="editor"
                  power={totalPower}
                />
              </div>
            </div>

            <div className="min-w-0">
              <div className="rounded-2xl border border-[var(--theme-color-semantic-info-border)] p-3 sm:rounded-3xl sm:p-4 bg-[var(--theme-color-panel-background)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-xl font-bold text-[var(--theme-color-text-default)] sm:text-2xl">{cardName}</h3>
                    <p className="mt-1 text-sm font-semibold text-[var(--theme-color-text-muted)]">{characterName}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {metadata?.rarity ? <span className="rounded-full border border-[var(--theme-color-semantic-warning-border)] bg-[var(--theme-color-control-background)] px-3 py-1 text-xs font-bold text-[var(--theme-color-semantic-warning-foreground)]">★{metadata.rarity}</span> : null}
                    {isBandoriCardAttribute(attribute) ? (
                      <span className={cn("rounded-full border px-3 py-1 text-xs font-bold", ATTRIBUTE_CLASSES[attribute])}>
                        {ATTRIBUTE_LABELS[attribute]}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:mt-5 sm:gap-4">
                <label className="grid gap-2 sm:grid-cols-[128px_minmax(0,1fr)] sm:items-center">
                  <span className="text-sm font-semibold text-[var(--theme-color-text-muted)] sm:text-right">{t("fields.level")}</span>
                  <select
                    value={draft.level}
                    onChange={(event) => updateDraft("level", Number(event.target.value))}
                    className="hhwx-control h-10 w-full rounded-2xl border px-4 text-sm font-semibold transition sm:h-11"
                  >
                    {Array.from({ length: levelLimit }, (_, index) => index + 1).map((level) => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                </label>

                <SegmentedControl label={t("fields.masterRank")} value={draft.masterRank} options={[0, 1, 2, 3, 4].map((value) => ({ value, label: String(value) }))} onChange={(value) => updateDraft("masterRank", value)} />
                <SegmentedControl label={t("fields.skillLevel")} value={draft.skillLevel} options={[1, 2, 3, 4, 5].map((value) => ({ value, label: String(value) }))} onChange={(value) => updateDraft("skillLevel", value)} />
                <SegmentedControl label={t("fields.episodes")} value={draft.episodeCount} options={Array.from({ length: maxEpisodeCount + 1 }, (_, value) => ({ value, label: String(value) }))} onChange={(value) => updateDraft("episodeCount", value)} />
                <SegmentedControl label={t("fields.trained")} value={draft.isTrained} options={(canTrain ? [false, true] : [false]).map((value) => ({ value, label: t(value ? "states.yes" : "states.no") }))} onChange={(value) => updateDraft("isTrained", value)} />
                {showTrainedArtControl && canTrain ? (
                  <SegmentedControl label={t("fields.afterTrainingArt")} value={draft.hasTrainedArt} options={[{ value: false, label: t("states.no") }, { value: true, label: t("states.yes") }]} onChange={(value) => updateDraft("hasTrainedArt", value)} />
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <footer className={cn(
          "grid shrink-0 gap-2 border-t border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:flex sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-6 sm:py-4",
          showDeleteButton ? "grid-cols-3" : "grid-cols-2",
        )}>
          {showDeleteButton ? (
            <button type="button" onClick={onDelete} disabled={isBusy} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-2xl border border-[var(--theme-color-semantic-danger-border)] bg-[var(--theme-color-control-background)] px-2 text-sm font-bold text-[var(--theme-color-semantic-danger-foreground)] transition hover:bg-[var(--theme-color-semantic-danger-background)] disabled:cursor-not-allowed disabled:opacity-60 sm:h-11 sm:gap-2 sm:px-4">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {effectiveDeleteLabel}
            </button>
          ) : null}
          <button type="button" onClick={onClose} disabled={isBusy} className="hhwx-control inline-flex h-10 items-center justify-center gap-1.5 rounded-2xl border px-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 sm:h-11 sm:gap-2 sm:px-4">
            <X className="h-4 w-4" aria-hidden="true" />
            {t("actions.cancel")}
          </button>
          <span
            className={cn("relative flex", isApplyDisabled && "cursor-not-allowed")}
            tabIndex={hasApplyDisabledReason ? 0 : undefined}
            title={hasApplyDisabledReason ? applyDisabledReason : undefined}
            aria-label={hasApplyDisabledReason ? `${applyLabel}: ${applyDisabledReason}` : undefined}
            aria-disabled={hasApplyDisabledReason ? true : undefined}
          >
            <button
              type="button"
              onClick={() => onApply(draft)}
              disabled={isApplyDisabled}
              className="hhwx-action-accent inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-2xl px-2 text-sm font-bold transition disabled:pointer-events-none sm:h-11 sm:gap-2 sm:px-5"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {isBusy ? t("actions.applying") : applyLabel}
            </button>
          </span>
        </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
