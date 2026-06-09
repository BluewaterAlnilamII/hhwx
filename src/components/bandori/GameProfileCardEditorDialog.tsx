"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Save, Trash2, X } from "lucide-react";
import SharedBandoriCardThumbnail from "@/components/bandori/BandoriCardThumbnail";
import { type BandoriAssetRegion } from "@/lib/bandori-asset-proxy";
import {
  getGameProfileCardLevelLimit,
  hasGameProfileCardChanged,
  pickGameProfileCardName,
  type GameProfileCardAttribute,
  type GameProfileCardMetadata,
} from "@/lib/bandori-game-profile-card";
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

const ATTRIBUTE_LABELS: Record<GameProfileCardAttribute, string> = {
  powerful: "Powerful",
  pure: "Pure",
  cool: "Cool",
  happy: "Happy",
};

const ATTRIBUTE_CLASSES: Record<GameProfileCardAttribute, string> = {
  powerful: "border-rose-300 bg-rose-50 text-rose-600",
  pure: "border-emerald-300 bg-emerald-50 text-emerald-600",
  cool: "border-sky-300 bg-sky-50 text-sky-600",
  happy: "border-orange-300 bg-orange-50 text-orange-600",
};

function clampInteger(value: number, min: number, max: number): number {
  const normalizedValue = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.min(max, Math.max(min, normalizedValue));
}

function isKnownAttribute(value: string | undefined): value is GameProfileCardAttribute {
  return value === "powerful" || value === "pure" || value === "cool" || value === "happy";
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
      <div className="text-sm font-semibold text-slate-600 sm:text-right">{label}</div>
      <div className="inline-flex w-fit overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={Object.is(option.value, value)}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-w-9 border-r border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 transition last:border-r-0 hover:bg-sky-50 hover:text-sky-700 sm:min-w-10 sm:px-4 sm:py-2",
              Object.is(option.value, value) && "bg-sky-600 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)] hover:bg-sky-600 hover:text-white",
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
  baselineCard?: UserGameProfileCardRecord | null;
  metadata?: GameProfileCardMetadata;
  characterName: string;
  bandId: number | null;
  characterBonusesById?: Record<string, BandoriCharacterBonusState | undefined>;
  region: BandoriAssetRegion;
  saving: boolean;
  title?: string;
  saveLabel?: string;
  deleteLabel?: string;
  showDeleteButton?: boolean;
  showTrainedArtControl?: boolean;
  allowSaveWithoutChanges?: boolean;
  onClose: () => void;
  onSave: (card: UserGameProfileCardRecord) => void;
  onDelete: () => void;
};

export default function GameProfileCardEditorDialog({
  card,
  baselineCard = null,
  metadata,
  characterName,
  bandId,
  characterBonusesById = {},
  region,
  saving,
  title = "编辑卡牌资料",
  saveLabel = "保存",
  deleteLabel = "删除",
  showDeleteButton = true,
  showTrainedArtControl = true,
  allowSaveWithoutChanges = false,
  onClose,
  onSave,
  onDelete,
}: GameProfileCardEditorDialogProps) {
  const [draft, setDraft] = useState(card);
  const levelLimit = getGameProfileCardLevelLimit(draft, metadata);
  const cardName = pickGameProfileCardName(draft.cardId, metadata);
  const hasChanges = baselineCard ? hasGameProfileCardChanged(draft, baselineCard) : hasGameProfileCardChanged(draft, card);
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
    draft.cardId,
    draft.episodeCount,
    draft.hasTrainedArt,
    draft.isTrained,
    draft.level,
    draft.masterRank,
    draft.skillLevel,
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
      return {
        ...nextDraft,
        level: clampInteger(nextDraft.level, 1, getGameProfileCardLevelLimit(nextDraft, metadata)),
        masterRank: clampInteger(nextDraft.masterRank, 0, 4),
        skillLevel: clampInteger(nextDraft.skillLevel, 1, 5),
        episodeCount: clampInteger(nextDraft.episodeCount, 0, 2),
      };
    });
  }

  const dialog = (
    <div className="fixed inset-0 z-[1100] flex h-dvh items-center justify-center overflow-hidden overscroll-contain bg-slate-950/55 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="card-editor-title">
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/90 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.42)] sm:max-h-[calc(100dvh-3rem)] sm:rounded-[28px]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 sm:px-6 sm:py-4">
          <div>
            <h2 id="card-editor-title" className="text-lg font-bold text-slate-900 sm:text-xl">{title}</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">Card #{draft.cardId}</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:text-rose-500" aria-label="关闭编辑器">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-5">
          <div className="grid gap-3 sm:gap-5 lg:grid-cols-[132px_minmax(0,1fr)]">
            <div className="mx-auto flex w-full max-w-[104px] flex-col items-center sm:max-w-[132px]">
              <div className="h-[104px] w-[104px] overflow-visible rounded-[5px] bg-white shadow-[0_2px_7px_rgba(15,23,42,0.22)] sm:h-[132px] sm:w-[132px]">
                <SharedBandoriCardThumbnail
                  card={draft}
                  metadata={metadata}
                  bandId={bandId}
                  region={region}
                  alt={`${cardName} 缩略图`}
                  size="editor"
                  power={totalPower}
                />
              </div>
            </div>

            <div className="min-w-0">
              <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-white via-sky-50/80 to-rose-50/70 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] sm:rounded-3xl sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-xl font-bold text-slate-900 sm:text-2xl">{cardName}</h3>
                    <p className="mt-1 text-sm font-semibold text-slate-600">{characterName}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {metadata?.rarity ? <span className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-bold text-amber-600">★{metadata.rarity}</span> : null}
                    {isKnownAttribute(metadata?.attribute) ? (
                      <span className={cn("rounded-full border px-3 py-1 text-xs font-bold", ATTRIBUTE_CLASSES[metadata.attribute])}>
                        {ATTRIBUTE_LABELS[metadata.attribute]}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:mt-5 sm:gap-4">
                <label className="grid gap-2 sm:grid-cols-[128px_minmax(0,1fr)] sm:items-center">
                  <span className="text-sm font-semibold text-slate-600 sm:text-right">等级</span>
                  <select
                    value={draft.level}
                    onChange={(event) => updateDraft("level", Number(event.target.value))}
                    className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100 sm:h-11"
                  >
                    {Array.from({ length: levelLimit }, (_, index) => index + 1).map((level) => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                </label>

                <SegmentedControl label="星光等级" value={draft.masterRank} options={[0, 1, 2, 3, 4].map((value) => ({ value, label: String(value) }))} onChange={(value) => updateDraft("masterRank", value)} />
                <SegmentedControl label="技能等级" value={draft.skillLevel} options={[1, 2, 3, 4, 5].map((value) => ({ value, label: String(value) }))} onChange={(value) => updateDraft("skillLevel", value)} />
                <SegmentedControl label="故事" value={draft.episodeCount} options={[0, 1, 2].map((value) => ({ value, label: String(value) }))} onChange={(value) => updateDraft("episodeCount", value)} />
                <SegmentedControl label="特训" value={draft.isTrained} options={[{ value: false, label: "否" }, { value: true, label: "是" }]} onChange={(value) => updateDraft("isTrained", value)} />
                {showTrainedArtControl ? (
                  <SegmentedControl label="特训后图" value={draft.hasTrainedArt} options={[{ value: false, label: "否" }, { value: true, label: "是" }]} onChange={(value) => updateDraft("hasTrainedArt", value)} />
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <footer className={cn(
          "grid shrink-0 gap-2 border-t border-slate-200 bg-white/82 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:flex sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-6 sm:py-4",
          showDeleteButton ? "grid-cols-3" : "grid-cols-2",
        )}>
          {showDeleteButton ? (
            <button type="button" onClick={onDelete} disabled={saving} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-2xl border border-rose-200 bg-white px-2 text-sm font-bold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 sm:h-11 sm:gap-2 sm:px-4">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {deleteLabel}
            </button>
          ) : null}
          <button type="button" onClick={onClose} disabled={saving} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 sm:h-11 sm:gap-2 sm:px-4">
            <X className="h-4 w-4" aria-hidden="true" />
            取消
          </button>
          <button type="button" onClick={() => onSave(draft)} disabled={saving || (!allowSaveWithoutChanges && !hasChanges)} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-2xl bg-sky-600 px-2 text-sm font-bold text-white shadow-[0_12px_28px_rgba(37,99,235,0.26)] transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none sm:h-11 sm:gap-2 sm:px-5">
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? "保存中..." : saveLabel}
          </button>
        </footer>
      </div>
    </div>
  );

  const portalRoot = typeof document === "undefined" ? null : document.body;
  if (!portalRoot) {
    return null;
  }

  return createPortal(dialog, portalRoot);
}
