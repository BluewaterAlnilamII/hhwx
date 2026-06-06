"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Save, Trash2, X } from "lucide-react";
import SharedBandoriCardThumbnail from "@/app/bandori/BandoriCardThumbnail";
import { type BandoriAssetRegion } from "@/lib/bandori-asset-proxy";
import { pickBestdoriCnThenJpName } from "@/lib/bestdori-regional-names";
import { type UserGameProfileCardRecord } from "@/lib/user-game-profile-payload";
import { cn } from "@/lib/utils";

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
    <div className="grid gap-2 sm:grid-cols-[128px_minmax(0,1fr)] sm:items-center">
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
              "min-w-10 border-r border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition last:border-r-0 hover:bg-sky-50 hover:text-sky-700",
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
  region: BandoriAssetRegion;
  saving: boolean;
  title?: string;
  saveLabel?: string;
  deleteLabel?: string;
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
  region,
  saving,
  title = "编辑卡牌资料",
  saveLabel = "保存",
  deleteLabel = "删除",
  allowSaveWithoutChanges = false,
  onClose,
  onSave,
  onDelete,
}: GameProfileCardEditorDialogProps) {
  const [draft, setDraft] = useState(card);
  const levelLimit = getGameProfileCardLevelLimit(draft, metadata);
  const cardName = pickGameProfileCardName(draft.cardId, metadata);
  const hasChanges = baselineCard ? hasGameProfileCardChanged(draft, baselineCard) : hasGameProfileCardChanged(draft, card);

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
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-slate-950/72 px-0 py-0 backdrop-blur-md sm:items-center sm:px-4 sm:py-8" role="dialog" aria-modal="true" aria-labelledby="card-editor-title">
      <div className="flex max-h-[96dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] border border-white/90 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.42)] sm:rounded-[28px]">
        <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div>
            <h2 id="card-editor-title" className="text-xl font-bold text-slate-900">{title}</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">Card #{draft.cardId}</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition hover:border-rose-200 hover:text-rose-500" aria-label="关闭编辑器">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-5 lg:grid-cols-[132px_minmax(0,1fr)]">
            <div className="mx-auto flex w-full max-w-[132px] flex-col items-center">
              <div className="h-[112px] w-[112px] overflow-hidden rounded-[8px] border border-white/80 bg-white shadow-[0_14px_32px_rgba(15,23,42,0.18)]">
                <SharedBandoriCardThumbnail card={draft} metadata={metadata} bandId={bandId} region={region} alt={`${cardName} 缩略图`} size="preview" />
              </div>
            </div>

            <div className="min-w-0">
              <div className="rounded-3xl border border-sky-100 bg-gradient-to-br from-white via-sky-50/80 to-rose-50/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-2xl font-bold text-slate-900">{cardName}</h3>
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

              <div className="mt-5 grid gap-4">
                <label className="grid gap-2 sm:grid-cols-[128px_minmax(0,1fr)] sm:items-center">
                  <span className="text-sm font-semibold text-slate-600 sm:text-right">等级</span>
                  <select
                    value={draft.level}
                    onChange={(event) => updateDraft("level", Number(event.target.value))}
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
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
                <SegmentedControl label="特训后图" value={draft.hasTrainedArt} options={[{ value: false, label: "否" }, { value: true, label: "是" }]} onChange={(value) => updateDraft("hasTrainedArt", value)} />
              </div>
            </div>
          </div>
        </div>

        <footer className="flex flex-col-reverse gap-3 border-t border-slate-200 bg-white/82 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          <button type="button" onClick={onDelete} disabled={saving} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 text-sm font-bold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {deleteLabel}
          </button>
          <button type="button" onClick={onClose} disabled={saving} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
            <X className="h-4 w-4" aria-hidden="true" />
            取消
          </button>
          <button type="button" onClick={() => onSave(draft)} disabled={saving || (!allowSaveWithoutChanges && !hasChanges)} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(37,99,235,0.26)] transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none">
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
